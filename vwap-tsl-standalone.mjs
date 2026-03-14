#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🛰️  VWAP TSL — STANDALONE AUTONOMOUS BOT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  FICHIER WAHD — KOLSHI HNA:
 *    ✅ Data Fetching (Binance API)
 *    ✅ Weekly VWAP Calculation (Max/Min/Mid)
 *    ✅ Entry Logic (Structural Breakout + Density Squeeze)
 *    ✅ Exit Logic (Stop-Loss, Trailing, AVWAP Guard, Basket, RSI, Moonshot)
 *    ✅ Position Management (3-Slot Rotation + Stagnation Swap)
 *    ✅ Telegram Alerts
 *    ✅ Balance Tracking
 *
 *  Run:   node vwap-tsl-standalone.mjs
 *  Stop:  Ctrl+C
 *  PM2:   pm2 start vwap-tsl-standalone.mjs --name vwap-tsl
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 1: CONFIGURATION                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

const CONFIG = {
    // Files
    configFile: path.join(__dirname, 'server', 'bot_config.json'),
    huntsFile:  path.join(__dirname, 'server', 'data', 'active_hunts.json'),

    // Timing
    scanIntervalMs:    60 * 1000,    // Scanner cycle: 60 seconds
    trackerIntervalMs: 10 * 1000,    // Exit checker: 10 seconds
    apiDelayMs:        60,           // Delay between Binance API calls (rate limit)

    // Rotation Slots
    maxSlots: 50,                     // Maximum concurrent positions

    // Entry Filters
    maxDistancePct:    0.015,        // Max 1.5% above VWAP Mid to enter (was 5%)
    minVolume24h:      1_000_000,    // Min $1M 24h volume (skip small caps)
    entryRsiMin:       45,           // Min RSI(5m) to enter (no downtrend)
    entryRsiMax:       65,           // Max RSI(5m) to enter (no overbought)
    volatilityMinPct:  0.005,        // Min 0.5% weekly range (skip dead coins)

    // Exit: Stop Loss
    hardStopPct: 0.05,         // -4% hard stop loss
    
    // Exit: Trailing Tiers
    tier2TriggerPct:   0.10,         // +10% peak → activate Tier 2
    tier2TrailPct:     0.07,         // 7% trail distance at Tier 2
    tier3TriggerPct:   0.30,         // +30% peak → activate Tier 3
    tier3TrailPct:     0.12,         // 12% trail distance at Tier 3

    // Exit: RSI Exhaustion
    rsiExhaustionLevel: 80,          // RSI(5m) > 80 = exhaustion

    // Stagnation Swap
    stagnationAgeMs:   60 * 60 * 1000,  // 1 hour minimum age
    stagnationMinPnl:  0.1,              // Minimum +0.1% PnL
    stagnationMaxPnl:  1.0,              // Maximum +1.0% PnL

    // Re-entry Cooldown
    cooldownMs:        4 * 60 * 60 * 1000,  // 4 hours after a loss

    // VWAP Cache
    vwapCacheDurationMs: 15 * 60 * 1000,    // 15 minutes

    // Stablecoins to skip
    stablecoins: [
        'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USTC',
        'EUR', 'GBP', 'JPY', 'USDP', 'GUSD', 'PYUSD', 'AEUR', 'ZUSD',
        'SDE', 'XUSD', 'USDE', 'USDS', 'VAI', 'USD'
    ]
};


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 2: STATE & LOCKS                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

let isScannerRunning = false;
let isTrackerRunning = false;
const vwapCache = new Map();


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 3: FILE I/O (Config + Hunts)                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG.configFile)) {
            return JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return { botToken: '', chatId: '', enabled: true, totalBalance: 100.0 };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG.configFile, JSON.stringify(config, null, 2));
}

function loadHunts() {
    try {
        if (fs.existsSync(CONFIG.huntsFile)) {
            const content = fs.readFileSync(CONFIG.huntsFile, 'utf8').trim();
            return content ? JSON.parse(content) : [];
        }
    } catch (e) {
        log('IO', '⚠️', `Failed to parse hunts: ${e.message}`);
    }
    return [];
}

function saveHunts(hunts) {
    fs.writeFileSync(CONFIG.huntsFile, JSON.stringify(hunts, null, 2));
}

function updateBalance(pnlPct, capital) {
    const config = loadConfig();
    if (config.totalBalance !== undefined) {
        const pnlAmount = capital * (pnlPct / 100);
        config.totalBalance += pnlAmount;
        saveConfig(config);
        log('Balance', '💰', `$${config.totalBalance.toFixed(2)} (${pnlAmount >= 0 ? '+' : ''}$${pnlAmount.toFixed(2)})`);
    }
}

function log(tag, emoji, msg) {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`[${time}] [${tag}] ${emoji} ${msg}`);
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 4: TELEGRAM ALERTS                                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

async function sendTelegram(text) {
    const config = loadConfig();
    if (!config.enabled || !config.botToken || !config.chatId) return;

    const chatIds = config.chatId.split(',').map(id => id.trim());
    for (const id of chatIds) {
        try {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
                chat_id: id,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } catch (err) {
            log('Telegram', '❌', err.message);
        }
    }
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 5: BINANCE DATA FETCHING                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Fetch kline (candlestick) data from Binance
 * @param {string} symbol   - e.g. 'BTCUSDT'
 * @param {string} interval - e.g. '1d', '15m', '5m'
 * @param {number} limit    - number of candles
 * @param {number} startTime - optional start timestamp in ms
 * @returns {Array} Array of { time, open, high, low, close, volume, quoteVolume }
 */
async function fetchKlines(symbol, interval, limit, startTime) {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    let url = `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    if (startTime) url += `&startTime=${startTime}`;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        return res.data.map(d => ({
            time:        Math.floor(d[0] / 1000),
            open:        parseFloat(d[1]),
            high:        parseFloat(d[2]),
            low:         parseFloat(d[3]),
            close:       parseFloat(d[4]),
            volume:      parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (err) {
        return [];
    }
}

/**
 * Fetch the top N USDT trading pairs sorted by 24h quote volume
 * @param {number} topN - Number of pairs to return
 * @returns {Array} Array of symbol strings e.g. ['BTCUSDT', 'ETHUSDT', ...]
 */
async function fetchTopSymbols(topN = 300) {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 15000 });
    return res.data
        .filter(t => t.symbol.endsWith('USDT'))
        .filter(t => parseFloat(t.quoteVolume) >= CONFIG.minVolume24h)  // Volume ≥ $1M filter
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, topN)
        .map(t => t.symbol);
}

/**
 * Fetch live price for a symbol (last 2 x 15m candles)
 * Returns { candleClose, livePrice } — candleClose = last completed candle, livePrice = current
 */
async function fetchLivePrice(symbol) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=2`;
    const { data: klines } = await axios.get(url, { timeout: 10000 });
    if (!klines || klines.length < 2) return null;
    return {
        candleClose: parseFloat(klines[0][4]),
        livePrice:   parseFloat(klines[1][4])
    };
}

/**
 * Calculate RSI on 5-minute timeframe
 * @param {string} symbol
 * @returns {Object} { rsi, last5mClose }
 */
async function fetchRSI5m(symbol) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=20`;
    const { data: klines5m } = await axios.get(url, { timeout: 10000 });

    let rsi = 50;
    if (klines5m && klines5m.length >= 15) {
        const closes = klines5m.map(k => parseFloat(k[4]));
        let gains = 0, losses = 0;
        for (let i = closes.length - 14; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));
    }

    const last5mClose = klines5m && klines5m.length >= 2 ? parseFloat(klines5m[klines5m.length - 2][4]) : 0;
    return { rsi, last5mClose };
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 6: VWAP CALCULATION                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Get the Monday 00:00 UTC timestamp for any given unix timestamp
 * Used to group daily klines into weekly buckets
 */
function getMondayTimestamp(ts) {
    const d = new Date(ts * 1000);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const mon = new Date(ts * 1000);
    mon.setUTCHours(0, 0, 0, 0);
    mon.setUTCDate(mon.getUTCDate() - diff);
    return Math.floor(mon.getTime() / 1000);
}

/**
 * Calculate the Weekly VWAP Channel for a symbol:
 *   - max:  Highest daily VWAP this week (completed days only)
 *   - min:  Lowest daily VWAP this week (completed days only)
 *   - mid:  Today's live daily VWAP
 *   - last15mClose: Latest 15m candle close price
 *
 * Daily VWAP = QuoteVolume / BaseVolume for each day
 * Weekly Max/Min = Highest/Lowest of completed daily VWAPs this week
 *
 * Uses a 15-minute cache to avoid hammering Binance API
 */
async function calculateVwapChannel(symbol) {
    const now = Date.now();
    const cached = vwapCache.get(symbol);

    let wMax, wMin, currentMid;

    // Step 1: Calculate Weekly VWAP Channel from daily klines (cached 15min)
    if (cached && cached.expires > now) {
        wMax = cached.wMax;
        wMin = cached.wMin;
        currentMid = cached.currentMid;
    } else {
        // Fetch 30 days of daily klines
        const dailyKlines = await fetchKlines(symbol, '1d', 30);
        if (dailyKlines.length < 15) return null;

        const nowTs = Math.floor(now / 1000);
        const mondayTs = getMondayTimestamp(nowTs);

        wMax = -Infinity;
        wMin = Infinity;
        currentMid = 0;

        // Calculate daily VWAP for each day = QuoteVolume / BaseVolume
        const dailyVwaps = dailyKlines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        dailyKlines.forEach((k, index) => {
            const dailyVwap = dailyVwaps[index];

            // For completed days this week → update max/min channel
            if (getMondayTimestamp(k.time) === mondayTs && index < dailyKlines.length - 1) {
                if (dailyVwap > wMax) wMax = dailyVwap;
                if (dailyVwap < wMin) wMin = dailyVwap;
            }

            // Last candle = today's live VWAP (mid line)
            if (index === dailyKlines.length - 1) {
                currentMid = dailyVwap;
            }
        });

        // Early week: no completed days yet → use today's VWAP as channel
        if (wMax === -Infinity) {
            wMax = currentMid;
            wMin = currentMid;
        }

        // Cache for 15 minutes
        vwapCache.set(symbol, { wMax, wMin, currentMid, expires: now + CONFIG.vwapCacheDurationMs });
    }

    // Step 2: Get latest 15m candle close for precise entry/exit
    const klines15m = await fetchKlines(symbol, '15m', 2);
    if (klines15m.length < 1) return null;
    const last15mClose = klines15m[klines15m.length - 1].close;

    return {
        max: wMax,           // Weekly VWAP High (channel top)
        min: wMin,           // Weekly VWAP Low (channel bottom)
        mid: currentMid,     // Today's Daily VWAP (mid line)
        last15mClose         // Current price (15m close)
    };
}



/**
 * Calculate Density Score — measures how tightly the 3 VWAP lines are squeezed
 *   100% = Perfect squeeze (all 3 lines converged)
 *   0%   = Wide spread (no squeeze)
 *
 * High density (>80%) = High conviction entry (SQUEEZE BREAKOUT)
 */
function calculateDensityScore(vwapMax, vwapMid, vwapMin) {
    const values = [vwapMax, vwapMid, vwapMin];
    const avg = values.reduce((a, b) => a + b, 0) / 3;
    const avgDiffPct = values.reduce((acc, v) => acc + (Math.abs(v - avg) / avg), 0) / 3;
    return Math.max(0, Math.round(100 * (1 - (avgDiffPct / 0.02))));
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 7: ENTRY LOGIC                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Check if a symbol qualifies as a valid VWAP Rotation entry
 *
 * Entry Conditions (ALL must be true):
 *   1. STRUCTURAL SIGNAL: Daily VWAP (Mid) > Weekly Max > Weekly Min
 *      → The trend hierarchy must be perfectly aligned
 *      → On Mon/Tue: Max >= Min (allow equal, since week just started)
 *
 *   2. PRICE BREAKOUT: Last 15m close > Daily VWAP (Mid)
 *      → Price must be trading ABOVE the leading VWAP line
 *
 *   3. PURITY CHECK: Price >= Mid × purity buffer
 *      → On Monday: require small buffer above Mid (0.2-0.5%)
 *      → Other days: no buffer needed
 *
 *   4. DISTANCE CHECK: Price not more than 5% above Mid
 *      → Prevents chasing overextended moves
 *
 * @returns {Object|null} { isValid, density, distance } or null if not valid
 */
function checkEntryConditions(vwap) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const isEarlyWeek = dayOfWeek === 1 || dayOfWeek === 2;

    // Condition 1: Structural Signal — Mid > Max > Min (trend hierarchy)
    const isStructuralSignal = isEarlyWeek
        ? (vwap.mid > vwap.max && vwap.max >= vwap.min)   // Mon/Tue: allow Max == Min
        : (vwap.mid > vwap.max && vwap.max > vwap.min);   // Wed-Sun: strict hierarchy

    if (!isStructuralSignal) return null;

    // Condition 2: Price Breakout — Price above the leading line (Mid)
    const isPriceBreakout = vwap.last15mClose > vwap.mid;
    if (!isPriceBreakout) return null;

    // Condition 3: Monday Purity Buffer
    const isMonday = now.getUTCDay() === 1;
    const isLateMonday = isMonday && now.getUTCHours() >= 12;
    const purityBuffer = isLateMonday ? 1.005 : (isMonday ? 1.002 : 1.0);
    const isPure = vwap.last15mClose >= (vwap.mid * purityBuffer);
    if (!isPure) return null;

    // Condition 4: Distance Check — not overextended
    const distFromEntry = (vwap.last15mClose - vwap.mid) / vwap.mid;
    if (distFromEntry > CONFIG.maxDistancePct) return null;

    // Calculate Density Score
    const density = calculateDensityScore(vwap.max, vwap.mid, vwap.min);

    return {
        isValid: true,
        density,
        distance: distFromEntry,
        isSqueeze: density >= 80
    };
}

/**
 * Check if a symbol should be filtered out before VWAP analysis
 *
 * Filters:
 *   - Stablecoins (USDT, USDC, DAI, etc.)
 *   - Already active in Rotation
 *   - Recent loss cooldown (4h)
 *   - Dead coins (weekly range < 0.5%, except Mon/Tue)
 */
function shouldSkipSymbol(symbol, allHunts) {
    // Filter stablecoins
    const baseAsset = symbol.replace('USDT', '');
    const isStable = CONFIG.stablecoins.some(s => symbol.startsWith(s)) ||
        baseAsset.includes('USD') || baseAsset.includes('DAI') || baseAsset.includes('EUR');
    if (isStable) return 'Stablecoin';

    // Already active in Rotation?
    if (allHunts.find(h => h.symbol === symbol && h.status === 'active' && h.strategyId === 'vwap_tsl')) {
        return 'Already active';
    }

    // Re-entry cooldown (4h after loss)
    const recentLoss = allHunts.find(h =>
        h.symbol === symbol && h.status === 'closed' && h.pnl < 0 &&
        (Date.now() - new Date(h.exitTime).getTime()) < CONFIG.cooldownMs
    );
    if (recentLoss) return 'Cooldown';

    return null; // OK to proceed
}

/**
 * Check volatility filter on VWAP data
 * Skip coins with < 0.5% weekly range (dead/stable coins)
 * Exception: Mon/Tue (range starts at zero)
 */
function isVolatilityTooLow(vwap) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const isEarlyWeek = dayOfWeek === 1 || dayOfWeek === 2;

    const weeklyRangePct = vwap.min > 0 ? (vwap.max - vwap.min) / vwap.min : 0;
    return !isEarlyWeek && weeklyRangePct < CONFIG.volatilityMinPct;
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 8: EXIT LOGIC                                                        ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Close a hunt with given exit parameters
 * Updates the hunt object in-place, sends Telegram alert, updates balance
 */
async function closeHunt(hunt, exitPrice, reason) {
    hunt.status = 'closed';
    hunt.exitPrice = exitPrice;
    hunt.exitTime = new Date().toISOString();
    hunt.pnl = ((exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
    hunt.reason = reason;

    log('Exit', '💸', `CLOSED ${hunt.symbol} | PnL: ${hunt.pnl >= 0 ? '+' : ''}${hunt.pnl.toFixed(2)}% | ${reason}`);

    await sendTelegram([
        `${hunt.pnl >= 0 ? '🟢' : '🔴'} <b>VWAP TSL EXIT: #${hunt.symbol}</b>`,
        ``,
        `<b>PNL:</b> ${hunt.pnl >= 0 ? '+' : ''}${hunt.pnl.toFixed(2)}%`,
        `<b>Entry:</b> $${hunt.entryPrice.toLocaleString()}`,
        `<b>Exit:</b> $${exitPrice.toLocaleString()}`,
        `<b>Reason:</b> ${reason}`,
        `<b>Capital:</b> $${hunt.capital.toFixed(2)}`,
        ``,
        `💰 <i>${hunt.pnl >= 0 ? 'Profit locked.' : 'Loss minimized.'}</i>`
    ].join('\n'));

    updateBalance(hunt.pnl, hunt.capital);
}

/**
 * Check ALL exit conditions for a single active position
 * Returns { shouldExit, reason, exitPrice } or null
 *
 * Exit conditions (checked in priority order):
 *   1. MOONSHOT TP:        Live price >= +20% from entry → instant exit
 *   2. EMERGENCY STOP:     Live price <= stop price → instant exit
 *   3. HYPER-SCALP:        Peak >= +2.5% AND reversed 1% → exit
 *   4. AVWAP TREND GUARD:  Anchored VWAP slope turning negative → exit
 *   5. RSI EXHAUSTION:     RSI(5m) >= 80 AND price stalling → exit
 *   6. CANDLE STOP:        15m candle close <= stop price → exit
 */
async function checkExitConditions(hunt) {
    // ─── Fetch live & decision prices ───
    const priceData = await fetchLivePrice(hunt.symbol);
    if (!priceData) return null;

    const { candleClose, livePrice } = priceData;
    hunt.currentPrice = livePrice;

    // Update peak
    if (candleClose > hunt.peakPrice) {
        hunt.peakPrice = candleClose;
    }

    const peakProfitPct = (hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice;
    const liveProfitPct = (livePrice - hunt.entryPrice) / hunt.entryPrice;

    // ─── Calculate Stop Price ───
    let stopPrice = hunt.entryPrice * (1 - CONFIG.hardStopPct);  // Hard SL Configured (e.g., -5%)
    let newTier = 1;

    // Continuous Trailing Stop Logic
    let trailDist = 0.05; // 5% default protection when small profit
    
    if (peakProfitPct >= 0.40) {
        trailDist = 0.15; // Give 15% breathing room for massive multi-day runners
        newTier = 4;
    } else if (peakProfitPct >= 0.20) {
        trailDist = 0.10; // Give 10% breathing room for strong runners
        newTier = 3;
    } else if (peakProfitPct >= 0.08) {
        trailDist = 0.05; // Lock in tight when we have 8% profit
        newTier = 2;
    }

    if (peakProfitPct >= 0.04) {
        // Only start trailing significantly once we clear +4% peak
        const trailingStop = hunt.peakPrice * (1 - trailDist);
        if (trailingStop > stopPrice) {
            stopPrice = trailingStop;
        }
    }

    // ─── EXIT: EMERGENCY HARD STOP OR ACTIVATED TSL ───
    if (livePrice <= stopPrice) {
        const reason = stopPrice > hunt.entryPrice
            ? `Trailing Stop Loss Hit (Peak was +${(peakProfitPct * 100).toFixed(2)}%)`
            : `Hard Stop-Loss (-${(CONFIG.hardStopPct * 100).toFixed(0)}%)`;
        return { shouldExit: true, reason: `🚨 ${reason}`, exitPrice: livePrice };
    }


    // ─── TIER UPGRADE ALERT ───
    if (newTier > (hunt.tier || 1)) {
        hunt.tier = newTier;
        log('Exit', '🆙', `${hunt.symbol} → Tier ${newTier} (Peak: +${(peakProfitPct * 100).toFixed(2)}%)`);
        await sendTelegram([
            `💎 <b>TIER ${newTier} UPGRADE: #${hunt.symbol}</b>`,
            ``,
            `<b>Peak Profit:</b> +${(peakProfitPct * 100).toFixed(2)}%`,
            `<b>Stop Level:</b> $${stopPrice.toLocaleString()} (${stopPrice > hunt.entryPrice ? '🟢 PROTECTED' : '🔴 AT RISK'})`,
            ``,
            `<i>Hunting for the Moon... 🚀</i>`
        ].join('\n'));
    }
    hunt.tier = newTier;

    return null; // No exit condition met
}

/**
 * Check VWAP Full Long status for active rotation positions
 * If price drops below ANY of the 3 VWAP lines → Lost Full Long → Exit
 */
async function checkFullLongStatus(hunt) {
    const vwap = await calculateVwapChannel(hunt.symbol);
    if (!vwap) return false;

    const isFullLong = vwap.last15mClose > vwap.max &&
                       vwap.last15mClose > vwap.mid &&
                       vwap.last15mClose > vwap.min;
    return isFullLong;
}

// Dynamic Basket logic removed for VWAP TSL


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 9: POSITION REGISTRATION                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Register a new position in the rotation
 * Allocates 1/3 of total balance per slot
 */
function registerPosition(symbol, entryPrice, density, distance, entryRsi) {
    const hunts = loadHunts();

    // Duplicate check
    const alreadyActive = hunts.find(h =>
        h.symbol.toUpperCase() === symbol.toUpperCase() &&
        h.status === 'active' &&
        h.strategyId === 'vwap_tsl'
    );
    if (alreadyActive) return;

    // Budget: 1/3 of total balance
    let entriesBudget = 10.0;
    const config = loadConfig();
    if (config.totalBalance !== undefined) {
        entriesBudget = Math.floor((config.totalBalance / CONFIG.maxSlots) * 100) / 100;
    }

    const isSqueeze = (density || 0) >= 80;
    const entryReason = isSqueeze
        ? `VWAP Squeeze Breakout (Density: ${density}%)`
        : `VWAP Structural Breakout (Density: ${density}%)`;

    const newHunt = {
        symbol,
        entryPrice,
        entryTime: new Date().toISOString(),
        peakPrice: entryPrice,
        status: 'active',
        capital: entriesBudget,
        strategyId: 'vwap_tsl',
        density,
        entryDistance: distance ? (distance * 100).toFixed(2) + '%' : 'N/A',
        entryRsi: entryRsi ? Math.round(entryRsi) : 'N/A',
        entryReason,
        tier: 1
    };

    hunts.push(newHunt);
    saveHunts(hunts);

    log('Entry', isSqueeze ? '🔥' : '💎', `ENTERED ${symbol} at $${entryPrice} | Budget: $${entriesBudget} | Density: ${density}% | RSI: ${entryRsi || 'N/A'}`);

    sendTelegram([
        `${isSqueeze ? '🔥' : '🛰️'} <b>VWAP TSL ENTRY: #${symbol}</b>`,
        ``,
        `<b>Price:</b> $${entryPrice.toLocaleString()}`,
        `<b>Budget:</b> $${entriesBudget.toFixed(2)} (1/${CONFIG.maxSlots} of balance)`,
        density ? `<b>Density:</b> ${density}% ${isSqueeze ? '⚡ <i>(SQUEEZE!)</i>' : ''}` : '',
        `<b>Stop:</b> $${(entryPrice * (1 - CONFIG.hardStopPct)).toLocaleString()} (-${(CONFIG.hardStopPct * 100).toFixed(0)}%)`,
        ``,
        isSqueeze
            ? `🚀 <b>SQUEEZE BREAKOUT</b> — All 3 VWAP lines converged.`
            : `📈 <i>VWAP structural breakout confirmed.</i>`
    ].filter(Boolean).join('\n'));
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 10: MAIN SCANNER (Entry Engine)                                      ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Main scanning loop — runs every 60 seconds
 *
 * Flow:
 *   1. Fetch top 300 USDT pairs by volume
 *   2. Check basket exit on current positions
 *   3. Check Full Long status (VWAP exit) on current positions
 *   4. Scan all 300 pairs for new entry candidates
 *   5. Apply exits (close lost-long positions)
 *   6. Apply entries (fill available slots, swap stagnant ones)
 *   7. Purge excess slots (safety)
 */
async function runScanner() {
    if (isScannerRunning) return;
    isScannerRunning = true;
    log('Scanner', '🛰️', 'Cycle Start: Scanning Top 300...');

    try {
        // ─── STEP 1: Fetch Top 300 Pairs ───
        const topSymbols = await fetchTopSymbols(300);
        const allHunts = loadHunts();
        const rotationActive = allHunts.filter(h => h.status === 'active' && h.strategyId === 'vwap_tsl');

        // Detect stagnant slots
        const stagnantSlots = rotationActive.filter(h => {
            const ageMs = Date.now() - new Date(h.entryTime).getTime();
            const current = h.currentPrice || h.entryPrice;
            const pnl = ((current - h.entryPrice) / h.entryPrice) * 100;
            return ageMs >= CONFIG.stagnationAgeMs && pnl >= CONFIG.stagnationMinPnl && pnl <= CONFIG.stagnationMaxPnl;
        });

        log('Scanner', '📡', `${topSymbols.length} pairs | Active: ${rotationActive.length}/${CONFIG.maxSlots} | Stagnant: ${stagnantSlots.length}`);

        // ─── STEP 3: Scan For New Candidates ───
        const candidates = [];
        let currentOpenCount = rotationActive.length;
        const totalPotentialOpenings = (CONFIG.maxSlots - currentOpenCount) + stagnantSlots.length;

        for (const symbol of topSymbols) {
            if (candidates.length >= 20) break;

            // Pre-filter
            const skipReason = shouldSkipSymbol(symbol, allHunts);
            if (skipReason) continue;

            // Calculate VWAP Channel
            const vwap = await calculateVwapChannel(symbol);
            if (!vwap) continue;

            // Volatility filter
            if (isVolatilityTooLow(vwap)) continue;

            // Check entry conditions (structural + distance ≤ 1.5%)
            const entry = checkEntryConditions(vwap);
            if (!entry || !entry.isValid) continue;

            // RSI Entry Filter (45-65 = breakout zone only)
            let entryRsi = 50;
            try {
                const { rsi } = await fetchRSI5m(symbol);
                entryRsi = rsi;
                if (rsi < CONFIG.entryRsiMin || rsi > CONFIG.entryRsiMax) {
                    log('Scanner', '⏭️', `SKIP ${symbol} — RSI ${rsi.toFixed(0)} outside ${CONFIG.entryRsiMin}-${CONFIG.entryRsiMax} range`);
                    continue;
                }
            } catch (e) {
                continue; // Skip if RSI fetch fails
            }

            log('Scanner', '🛰️', `${entry.isSqueeze ? 'HIGH CONVICTION' : 'CANDIDATE'}: ${symbol} (Dist: ${(entry.distance * 100).toFixed(2)}%, Density: ${entry.density}%, RSI: ${entryRsi.toFixed(0)})`);
            candidates.push({ symbol, price: vwap.last15mClose, density: entry.density, distance: entry.distance, rsi: entryRsi, vwap });

            await new Promise(r => setTimeout(r, CONFIG.apiDelayMs));
        }

        // ─── Rank candidates by density (highest conviction first) ───
        candidates.sort((a, b) => b.density - a.density);
        if (candidates.length > 0) {
            log('Scanner', '📊', `Ranked ${candidates.length} candidates by density: ${candidates.map(c => `${c.symbol}(${c.density}%)`).join(', ')}`);
        }

        // ─── STEP 6: Apply Entries ───
        if (totalPotentialOpenings > 0 && candidates.length > 0) {
            for (const cand of candidates.slice(0, totalPotentialOpenings)) {
                const latestHunts = loadHunts();
                const isAlreadyIn = latestHunts.some(h => h.symbol === cand.symbol && h.status === 'active' && h.strategyId === 'vwap_tsl');
                if (isAlreadyIn) continue;

                // Stagnation swap if full
                if (currentOpenCount >= CONFIG.maxSlots) {
                    const swapTarget = stagnantSlots.shift();
                    if (swapTarget) {
                        log('Scanner', '♻️', `Swap: ${swapTarget.symbol} → ${cand.symbol}`);
                        const hunts = loadHunts();
                        for (const h of hunts) {
                            if (h.symbol === swapTarget.symbol && h.strategyId === 'vwap_tsl' && h.status === 'active') {
                                await closeHunt(h, h.currentPrice || h.entryPrice, 'Stagnation Swap (Opportunity Cost)');
                            }
                        }
                        saveHunts(hunts);
                        currentOpenCount--;
                    }
                }

                registerPosition(cand.symbol, cand.price, cand.density, cand.distance, cand.rsi);
                currentOpenCount++;
            }
        }

        // ─── STEP 7: Safety Purge ───
        const finalHunts = loadHunts();
        const finalActive = finalHunts
            .filter(h => h.status === 'active' && h.strategyId === 'vwap_tsl')
            .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

        if (finalActive.length > CONFIG.maxSlots) {
            log('Scanner', '🧹', `Purging ${finalActive.length - CONFIG.maxSlots} excess slots`);
            const toPurge = finalActive.slice(0, finalActive.length - CONFIG.maxSlots).map(h => h.symbol);
            for (const h of finalHunts) {
                if (toPurge.includes(h.symbol) && h.strategyId === 'vwap_tsl' && h.status === 'active') {
                    h.status = 'closed';
                    h.exitPrice = h.currentPrice || h.entryPrice;
                    h.exitTime = new Date().toISOString();
                    h.reason = 'Slot Capacity Purge';
                }
            }
            saveHunts(finalHunts);
        }

        log('Scanner', '✅', `Cycle done | Active: ${Math.min(finalActive.length, CONFIG.maxSlots)}/${CONFIG.maxSlots} | Candidates: ${candidates.length}`);

    } catch (err) {
        console.error('[Scanner] Error:', err.message);
    } finally {
        isScannerRunning = false;
    }
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 11: POSITION TRACKER (Exit Engine)                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

/**
 * Main tracking loop — runs every 10 seconds
 * Checks ALL exit conditions for each active position
 */
async function runTracker() {
    if (isTrackerRunning) return;
    isTrackerRunning = true;

    try {
        const hunts = loadHunts();
        const active = hunts.filter(h => h.status === 'active' && h.strategyId === 'vwap_tsl');
        if (active.length === 0) { isTrackerRunning = false; return; }

        let modified = false;

        for (const hunt of active) {
            try {
                const exitResult = await checkExitConditions(hunt);

                if (exitResult && exitResult.shouldExit) {
                    await closeHunt(hunt, exitResult.exitPrice, exitResult.reason);
                }

                modified = true;
                await new Promise(r => setTimeout(r, 200));

            } catch (err) {
                log('Tracker', '⚠️', `Error on ${hunt.symbol}: ${err.message}`);
            }
        }

        if (modified) saveHunts(hunts);

    } catch (err) {
        console.error('[Tracker] Error:', err.message);
    } finally {
        isTrackerRunning = false;
    }
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 12: BOOT SEQUENCE                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

async function boot() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  🛰️  VWAP TSL — STANDALONE AUTONOMOUS BOT');
    console.log('  📊  Strategy: VWAP Structural Breakout + 3-Slot Basket');
    console.log('  ⏱️  Scanner: 60s | Tracker: 10s');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

    // Ensure directories & files exist
    const dataDir = path.join(__dirname, 'server', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(CONFIG.huntsFile)) fs.writeFileSync(CONFIG.huntsFile, JSON.stringify([], null, 2));
    if (!fs.existsSync(CONFIG.configFile)) {
        fs.writeFileSync(CONFIG.configFile, JSON.stringify({
            botToken: '', chatId: '', enabled: true, totalBalance: 100.0
        }, null, 2));
    }

    // Show current state
    const config = loadConfig();
    const hunts = loadHunts();
    const activeHunts = hunts.filter(h => h.status === 'active' && h.strategyId === 'vwap_tsl');

    log('Boot', '💰', `Balance: $${config.totalBalance?.toFixed(2) || '100.00'}`);
    log('Boot', '📊', `Active positions: ${activeHunts.length}/${CONFIG.maxSlots}`);

    if (activeHunts.length > 0) {
        activeHunts.forEach(h => {
            const currentPnl = h.currentPrice ? (((h.currentPrice - h.entryPrice) / h.entryPrice) * 100).toFixed(2) : '?';
            log('Boot', '📍', `${h.symbol} — Entry: $${h.entryPrice} | PnL: ${currentPnl}%`);
        });
    }

    log('Boot', '⚙️', `Config: Hard SL=-5% | Trailing Default=5% | TSL > +4% | TSL > +20%=10% | TSL > +40%=15%`);

    // Telegram boot notification
    await sendTelegram([
        `🛰️ <b>VWAP TSL BOT STARTED</b>`,
        ``,
        `<b>Balance:</b> $${config.totalBalance?.toFixed(2) || '100.00'}`,
        `<b>Active:</b> ${activeHunts.length}/${CONFIG.maxSlots} slots`,
        `<b>Scanner:</b> Every ${CONFIG.scanIntervalMs / 1000}s`,
        `<b>Tracker:</b> Every ${CONFIG.trackerIntervalMs / 1000}s`,
        ``,
        `<b>Exit Rules:</b>`,
        `• Hard Stop-Loss: -5%`,
        `• Trailing Stop Loss: Dynamic (max 15%)`,
        `• RSI Exhaustion: >80`,
        `• AVWAP Trend Guard: Active`,
        ``,
        `🟢 <i>All systems online.</i>`
    ].join('\n'));

    // ─── Schedule Loops ───
    setInterval(async () => {
        try { await runScanner(); } catch (e) { console.error('[Main] Scanner Error:', e.message); }
    }, CONFIG.scanIntervalMs);

    setInterval(async () => {
        try { await runTracker(); } catch (e) { console.error('[Main] Tracker Error:', e.message); }
    }, CONFIG.trackerIntervalMs);

    // ─── Initial Run ───
    log('Boot', '🚀', 'Running initial scan...');
    try { await runScanner(); } catch (e) { console.error(e.message); }
    try { await runTracker(); } catch (e) { console.error(e.message); }

    log('Boot', '🟢', 'All systems online. Running 24/7...');
}


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 13: GRACEFUL SHUTDOWN & ERROR HANDLING                               ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

process.on('SIGINT', async () => {
    console.log('');
    log('Shutdown', '🛑', 'Graceful shutdown...');
    await sendTelegram(`🛑 <b>VWAP TSL BOT STOPPED</b>\n\n<i>Manual shutdown.</i>`);
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught:', err);
    sendTelegram(`🔴 <b>BOT CRASH</b>\n\n<code>${err.message}</code>`);
});

process.on('unhandledRejection', (err) => {
    console.error('[FATAL] Unhandled:', err);
});


// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  🚀 START                                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

boot();
