#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════
 *  🛰️  VWAP ROTATION BOT — Standalone Autonomous Trading Bot
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Strategies Combined:
 *    1. Golden Signal   — Original VWAP breakout entry (500k+ vol)
 *    2. Golden Pro       — Tighter filter (1.2M+ vol, -8% SL, +6% BE)
 *    3. VWAP Rotation    — Top 300 structural rotation (3-slot basket)
 *
 *  Focus: VWAP Rotation (primary strategy)
 *
 *  Run:  node vwap-rotation-bot.mjs
 *  Stop: Ctrl+C
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const CONFIG_FILE = path.join(__dirname, 'server', 'bot_config.json');
const HUNTS_FILE = path.join(__dirname, 'server', 'data', 'active_hunts.json');

const MAX_ROTATION_SLOTS = 3;
const SCAN_INTERVAL_MS = 60 * 1000;        // Scanner every 60 seconds
const TRACKER_INTERVAL_MS = 10 * 1000;      // Position tracker every 10 seconds
const BINANCE_DELAY_MS = 60;                // Delay between API calls to avoid rate limits

const STABLECOINS = [
    'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USTC',
    'EUR', 'GBP', 'JPY', 'USDP', 'GUSD', 'PYUSD', 'AEUR', 'ZUSD',
    'SDE', 'XUSD', 'USDE', 'USDS', 'VAI', 'USD'
];

// ═══════════════════════════════════════════════════════════════════
//  STATE & LOCKS
// ═══════════════════════════════════════════════════════════════════

let isScannerRunning = false;
let isTrackerRunning = false;
const vwapCache = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 min cache for weekly VWAP

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return { botToken: '', chatId: '', enabled: true, totalBalance: 100.0 };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadHunts() {
    try {
        if (fs.existsSync(HUNTS_FILE)) {
            const content = fs.readFileSync(HUNTS_FILE, 'utf8').trim();
            return content ? JSON.parse(content) : [];
        }
    } catch (e) {
        console.error('[Bot] ⚠️ Failed to parse hunts file:', e.message);
    }
    return [];
}

function saveHunts(hunts) {
    fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
}

function log(tag, emoji, msg) {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`[${time}] [${tag}] ${emoji} ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════
//  TELEGRAM
// ═══════════════════════════════════════════════════════════════════

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
            console.error('[Bot] Telegram Error:', err.message);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  BINANCE API
// ═══════════════════════════════════════════════════════════════════

async function fetchBinanceKlines(symbol, interval, limit, startTime) {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    let url = `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    if (startTime) url += `&startTime=${startTime}`;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        return res.data.map(d => ({
            time: Math.floor(d[0] / 1000),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (err) { return []; }
}

function getMondayTimestamp(ts) {
    const d = new Date(ts * 1000);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const mon = new Date(ts * 1000);
    mon.setUTCHours(0, 0, 0, 0);
    mon.setUTCDate(mon.getUTCDate() - diff);
    return Math.floor(mon.getTime() / 1000);
}

// ═══════════════════════════════════════════════════════════════════
//  VWAP CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

async function getVwapData(symbol) {
    const now = Date.now();
    const cached = vwapCache.get(symbol);

    let wMax, wMin, currentMid;

    if (cached && cached.expires > now) {
        wMax = cached.wMax;
        wMin = cached.wMin;
        currentMid = cached.currentMid;
    } else {
        const klines = await fetchBinanceKlines(symbol, '1d', 30);
        if (klines.length < 15) return null;

        const nowTs = Math.floor(now / 1000);
        const mondayTs = getMondayTimestamp(nowTs);

        wMax = -Infinity;
        wMin = Infinity;
        currentMid = 0;

        const rawVwap = klines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        klines.forEach((k, index) => {
            const dailyVwap = rawVwap[index];
            if (getMondayTimestamp(k.time) === mondayTs && index < klines.length - 1) {
                if (dailyVwap > wMax) wMax = dailyVwap;
                if (dailyVwap < wMin) wMin = dailyVwap;
            }
            if (index === klines.length - 1) currentMid = dailyVwap;
        });

        if (wMax === -Infinity) { wMax = currentMid; wMin = currentMid; }
        vwapCache.set(symbol, { wMax, wMin, currentMid, expires: now + CACHE_DURATION });
    }

    const klines15m = await fetchBinanceKlines(symbol, '15m', 2);
    if (klines15m.length < 1) return null;
    const lastClose = klines15m[klines15m.length - 1].close;

    return { max: wMax, min: wMin, mid: currentMid, last15mClose: lastClose };
}

async function getFullVwapData(symbol) {
    const [klines, klines15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 30),
        fetchBinanceKlines(symbol, '15m', 20)
    ]);

    if (klines.length < 15 || klines15m.length < 2) return null;

    const last15mClose = klines15m[klines15m.length - 2].close;
    const prev15mClose = klines15m[klines15m.length - 3]?.close || last15mClose;
    const history15m = klines15m.map(k => k.close);

    const nowTs = Math.floor(Date.now() / 1000);
    const mondayTs = getMondayTimestamp(nowTs);
    const prevMondayTs = mondayTs - (7 * 24 * 3600);

    let wMax = -Infinity, wMin = Infinity, currentMid = 0;
    const rawVwap = klines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    klines.forEach((k, index) => {
        const dailyVwap = rawVwap[index];
        const isCompletedDay = index < klines.length - 1;
        const kMonTs = getMondayTimestamp(k.time);

        if (kMonTs === mondayTs && isCompletedDay) {
            if (dailyVwap > wMax) wMax = dailyVwap;
            if (dailyVwap < wMin) wMin = dailyVwap;
        }
        if (index === klines.length - 1) currentMid = dailyVwap;
    });

    let prevWeekQVol = 0, prevWeekBVol = 0, currWeekQVol = 0, currWeekBVol = 0;
    klines.forEach(k => {
        const kMonTs = getMondayTimestamp(k.time);
        if (kMonTs === prevMondayTs) {
            prevWeekQVol += k.quoteVolume;
            prevWeekBVol += k.volume;
        } else if (kMonTs === mondayTs) {
            currWeekQVol += k.quoteVolume;
            currWeekBVol += k.volume;
        }
    });

    const prevWeekVwap = prevWeekBVol > 0 ? prevWeekQVol / prevWeekBVol : 0;
    const currentWeekVwap = currWeekBVol > 0 ? currWeekQVol / currWeekBVol : currentMid;

    if (wMax === -Infinity) wMax = currentMid;
    if (wMin === Infinity) wMin = currentMid;

    return { max: wMax, min: wMin, mid: currentMid, prevWeekVwap, currentWeekVwap, last15mClose, prev15mClose, history15m };
}

// ═══════════════════════════════════════════════════════════════════
//  HUNT REGISTRATION
// ═══════════════════════════════════════════════════════════════════

function registerNewHunt(symbol, entryPrice, strategyId = 'golden_rotation', density) {
    try {
        const hunts = loadHunts();

        // Prevent duplicates
        const alreadyActive = hunts.find(h =>
            h.symbol.toUpperCase() === symbol.toUpperCase() &&
            h.status === 'active' &&
            (h.strategyId === strategyId || (!h.strategyId && strategyId === 'golden_signal'))
        );
        if (alreadyActive) return;

        // Budget: divide total balance by 3 slots
        let entriesBudget = 10.0;
        const config = loadConfig();
        if (config.totalBalance !== undefined) {
            entriesBudget = Math.floor((config.totalBalance / 3) * 100) / 100;
        }

        const newHunt = {
            symbol,
            entryPrice,
            entryTime: new Date().toISOString(),
            peakPrice: entryPrice,
            status: 'active',
            capital: entriesBudget,
            strategyId,
            density
        };

        hunts.push(newHunt);
        saveHunts(hunts);

        let strategyName = 'Golden Rotation';
        if (strategyId === 'golden_signal') strategyName = 'Golden Signal';
        if (strategyId === 'golden_pro') strategyName = 'Golden Pro';

        const isSqueeze = (density || 0) >= 80;

        log('Register', '💎', `${strategyName}: ${symbol} at $${entryPrice} | Budget: $${entriesBudget}`);

        sendTelegram([
            `${isSqueeze ? '🔥' : '💎'} <b>${strategyName.toUpperCase()} ENTRY: #${symbol}</b>`,
            ``,
            `<b>Price:</b> $${entryPrice.toLocaleString()}`,
            density ? `<b>Density Score:</b> ${density}% ${isSqueeze ? '⚡ <i>(SQUEEZE)</i>' : ''}` : '',
            ``,
            isSqueeze
                ? `🚀 <b>SQUEEZE BREAKOUT:</b> Technical squeeze confirmed.`
                : `📈 Trend following initiated.`
        ].filter(Boolean).join('\n'));

    } catch (err) {
        console.error('[Bot] Registration Error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  STRATEGY 3: VWAP ROTATION ENGINE (PRIMARY)
// ═══════════════════════════════════════════════════════════════════

async function runRotationEngine() {
    if (isScannerRunning) return;
    isScannerRunning = true;
    log('Rotation', '🛰️', 'Cycle Start: Scanning Top 300...');

    try {
        // 1. Fetch Top 300 Volume USDT Pairs
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 15000 });
        const topSymbols = res.data
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 300)
            .map(t => t.symbol);

        const currentActive = loadHunts();
        const rotationActive = currentActive.filter(h => h.status === 'active' && h.strategyId === 'golden_rotation');

        // Stagnant Slots Detection (1h+ with only +0.1% to +1.0%)
        const STAGNATION_MIN_AGE_MS = 60 * 60 * 1000;
        const stagnantSlots = rotationActive.filter(h => {
            const ageMs = Date.now() - new Date(h.entryTime).getTime();
            const current = h.currentPrice || h.entryPrice;
            const pnl = ((current - h.entryPrice) / h.entryPrice) * 100;
            return ageMs >= STAGNATION_MIN_AGE_MS && pnl >= 0.1 && pnl <= 1.0;
        });

        log('Rotation', '📡', `Scanning ${topSymbols.length} pairs. Active: ${rotationActive.length}/${MAX_ROTATION_SLOTS} (${stagnantSlots.length} stagnant)`);

        // ─── BASKET EXIT LOGIC ───
        if (rotationActive.length > 0) {
            const totalPnL = rotationActive.reduce((acc, h) => {
                const current = h.currentPrice || h.entryPrice;
                const pnl = h.pnl ?? ((current - h.entryPrice) / h.entryPrice) * 100;
                return acc + pnl;
            }, 0);

            const bestPnL = Math.max(...rotationActive.map(h => {
                const current = h.currentPrice || h.entryPrice;
                return h.pnl ?? ((current - h.entryPrice) / h.entryPrice) * 100;
            }));

            const worstPnL = Math.min(...rotationActive.map(h => {
                const current = h.currentPrice || h.entryPrice;
                return ((current - h.entryPrice) / h.entryPrice) * 100;
            }));

            const dynamicTarget = Math.min(bestPnL * 0.8, 8.0);
            const isBasketExit = totalPnL >= dynamicTarget && totalPnL > 0;
            const isStrongRunner = bestPnL >= 8.0;
            const isCapitalProtection = Math.abs(totalPnL) <= 0.5 && worstPnL <= -2.0 && rotationActive.length >= 2;

            if (isBasketExit || isStrongRunner || isCapitalProtection) {
                let reason = "";
                if (isBasketExit) reason = `Dynamic Basket Target (+${totalPnL.toFixed(2)}% vs ${dynamicTarget.toFixed(2)}% target)`;
                else if (isStrongRunner) reason = `Strong Runner Exit (Top Token at +${bestPnL.toFixed(2)}%)`;
                else reason = `Capital Protection (Washing Loser ${worstPnL.toFixed(2)}% at breakeven)`;

                log('Rotation', '🧺', `${reason.toUpperCase()}. Closing all ${rotationActive.length} slots.`);

                const hunts = loadHunts();
                const symbolsToClose = rotationActive.map(h => h.symbol);

                hunts.forEach(h => {
                    if (symbolsToClose.includes(h.symbol) && h.strategyId === 'golden_rotation' && h.status === 'active') {
                        h.status = 'closed';
                        h.exitPrice = h.currentPrice || h.entryPrice;
                        h.exitTime = new Date().toISOString();
                        h.pnl = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100;
                        h.reason = reason;

                        // Update balance
                        const config = loadConfig();
                        if (config.totalBalance !== undefined) {
                            const pnlAmount = h.capital * (h.pnl / 100);
                            config.totalBalance += pnlAmount;
                            saveConfig(config);
                        }
                    }
                });
                saveHunts(hunts);

                await sendTelegram([
                    `🧺 <b>BASKET ${isBasketExit || isStrongRunner ? 'PROFIT TAKEN' : 'PROTECTED'}</b>`,
                    ``,
                    `<b>Reason:</b> ${reason}`,
                    `<b>Total PnL:</b> ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}%`,
                    `<b>Best Token:</b> +${bestPnL.toFixed(2)}%`,
                    `<b>Slots Cleared:</b> ${rotationActive.length}`,
                    ``,
                    `🛰️ <i>Ready for fresh candidates...</i>`
                ].join('\n'));

                isScannerRunning = false;
                return;
            }
        }

        // ─── CHECK EXITS FOR ACTIVE POSITIONS ───
        const toClose = [];
        for (const hunt of rotationActive) {
            const vwap = await getVwapData(hunt.symbol);
            if (!vwap) continue;
            const isFullLong = vwap.last15mClose > vwap.max && vwap.last15mClose > vwap.mid && vwap.last15mClose > vwap.min;
            if (!isFullLong) {
                log('Rotation', '🚨', `Lost Full Long: ${hunt.symbol}. Preparing to exit.`);
                toClose.push(hunt.symbol);
            }
        }

        // ─── SCAN FOR NEW ENTRY CANDIDATES ───
        const currentCandidates = [];
        let currentOpenCount = rotationActive.length - toClose.length;
        const availableOpenings = MAX_ROTATION_SLOTS - currentOpenCount;
        const totalPotentialOpenings = availableOpenings + stagnantSlots.length;

        for (const symbol of topSymbols) {
            if (currentCandidates.length >= 20) break;

            // Filter stablecoins
            const baseAsset = symbol.replace('USDT', '');
            const isStable = STABLECOINS.some(s => symbol.startsWith(s)) ||
                baseAsset.includes('USD') || baseAsset.includes('DAI') || baseAsset.includes('EUR');
            if (isStable) continue;

            // Already active in Rotation?
            if (currentActive.find(h => h.symbol === symbol && h.status === 'active' && h.strategyId === 'golden_rotation')) continue;

            // Re-entry cooldown (4h for losses)
            const recentLoss = currentActive.find(h =>
                h.symbol === symbol && h.status === 'closed' && h.pnl < 0 &&
                (Date.now() - new Date(h.exitTime).getTime()) < (4 * 60 * 60 * 1000)
            );
            if (recentLoss) continue;

            const vwap = await getVwapData(symbol);
            if (!vwap) continue;

            // ─── STRUCTURAL CONTEXT ───
            const now = new Date();
            const dayOfWeek = now.getUTCDay();
            const isEarlyWeek = dayOfWeek === 1 || dayOfWeek === 2;

            // Volatility filter (skip dead coins, but not on Mon/Tue)
            const weeklyRangePct = vwap.min > 0 ? (vwap.max - vwap.min) / vwap.min : 0;
            if (!isEarlyWeek && weeklyRangePct < 0.005) continue;

            // ─── STRUCTURAL ENTRY LOGIC ───
            const isStructuralSignal = isEarlyWeek
                ? (vwap.mid > vwap.max && vwap.max >= vwap.min)
                : (vwap.mid > vwap.max && vwap.max > vwap.min);

            const isPriceBreakout = vwap.last15mClose > vwap.mid;
            const distFromEntry = (vwap.last15mClose - vwap.mid) / vwap.mid;
            const MAX_DISTANCE_PCT = 0.05;

            // Monday purity buffer
            const isMonday = now.getUTCDay() === 1;
            const isLateMonday = isMonday && now.getUTCHours() >= 12;
            const dailyPurityBuffer = isLateMonday ? 1.005 : (isMonday ? 1.002 : 1.0);
            const isPure = vwap.last15mClose >= (vwap.mid * dailyPurityBuffer);

            // Density Squeeze
            const vwapValues = [vwap.max, vwap.mid, vwap.min];
            const avgVwap = vwapValues.reduce((a, b) => a + b, 0) / 3;
            const avgDiffPct = vwapValues.reduce((acc, v) => acc + (Math.abs(v - avgVwap) / avgVwap), 0) / 3;
            const densityScore = Math.max(0, 100 * (1 - (avgDiffPct / 0.02)));

            if (isStructuralSignal && isPriceBreakout && isPure && distFromEntry <= MAX_DISTANCE_PCT) {
                const isSqueeze = densityScore >= 80;
                log('Rotation', '🛰️', `${isSqueeze ? 'HIGH CONVICTION' : 'CANDIDATE'}: ${symbol} (Dist: ${(distFromEntry * 100).toFixed(2)}%, Density: ${Math.round(densityScore)}%)`);
                currentCandidates.push({ symbol, price: vwap.last15mClose, density: Math.round(densityScore), vwap });
            }

            await new Promise(r => setTimeout(r, BINANCE_DELAY_MS));
        }

        // ─── APPLY EXITS ───
        if (toClose.length > 0) {
            const hunts = loadHunts();
            hunts.forEach(h => {
                if (toClose.includes(h.symbol) && h.strategyId === 'golden_rotation' && h.status === 'active') {
                    h.status = 'closed';
                    h.exitPrice = h.currentPrice || h.entryPrice;
                    h.exitTime = new Date().toISOString();
                    h.pnl = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100;
                    h.reason = 'Lost Full Long Status (Rotation Swapped Out)';

                    const config = loadConfig();
                    if (config.totalBalance !== undefined) {
                        const pnlAmount = h.capital * (h.pnl / 100);
                        config.totalBalance += pnlAmount;
                        saveConfig(config);
                    }

                    log('Rotation', '💸', `CLOSED ${h.symbol} | PnL: ${h.pnl.toFixed(2)}%`);
                }
            });
            saveHunts(hunts);
        }

        // ─── APPLY ENTRIES (with Stagnation Swapping) ───
        if (totalPotentialOpenings > 0 && currentCandidates.length > 0) {
            for (const cand of currentCandidates.slice(0, totalPotentialOpenings)) {
                const latestHunts = loadHunts();
                const isAlreadyInRotation = latestHunts.some(h => h.symbol === cand.symbol && h.status === 'active' && h.strategyId === 'golden_rotation');
                if (isAlreadyInRotation) continue;

                // Swap out stagnant slot if full
                if (currentOpenCount >= MAX_ROTATION_SLOTS) {
                    const targetToSwap = stagnantSlots.shift();
                    if (targetToSwap) {
                        log('Rotation', '♻️', `Stagnation Swap: ${targetToSwap.symbol} → ${cand.symbol}`);
                        const hunts = loadHunts();
                        hunts.forEach(h => {
                            if (h.symbol === targetToSwap.symbol && h.strategyId === 'golden_rotation' && h.status === 'active') {
                                h.status = 'closed';
                                h.exitPrice = h.currentPrice || h.entryPrice;
                                h.exitTime = new Date().toISOString();
                                h.pnl = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100;
                                h.reason = 'Stagnation Swap (Opportunity Cost)';

                                const config = loadConfig();
                                if (config.totalBalance !== undefined) {
                                    const pnlAmount = h.capital * (h.pnl / 100);
                                    config.totalBalance += pnlAmount;
                                    saveConfig(config);
                                }
                            }
                        });
                        saveHunts(hunts);

                        const oldPnL = (((targetToSwap.currentPrice || targetToSwap.entryPrice) - targetToSwap.entryPrice) / targetToSwap.entryPrice) * 100;

                        await sendTelegram([
                            `♻️ <b>STAGNATION SWAP: #${targetToSwap.symbol} ➔ #${cand.symbol}</b>`,
                            ``,
                            `<b>Reason:</b> Opportunity Cost (1H+ Stagnation)`,
                            `<b>Old PnL:</b> +${oldPnL.toFixed(2)}%`,
                            ``,
                            `🛰️ <i>Rotating into faster momentum...</i>`
                        ].join('\n'));
                        currentOpenCount--;
                    }
                }

                log('Rotation', '🛰️', `Rotating into: ${cand.symbol}`);
                registerNewHunt(cand.symbol, cand.price, 'golden_rotation', cand.density);
                currentOpenCount++;
            }
        }

        // ─── SAFETY: Purge excess slots ───
        const finalHunts = loadHunts();
        const finalActive = finalHunts
            .filter(h => h.status === 'active' && h.strategyId === 'golden_rotation')
            .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

        if (finalActive.length > MAX_ROTATION_SLOTS) {
            log('Rotation', '🧹', `Cleaning up ${finalActive.length - MAX_ROTATION_SLOTS} excess slots...`);
            const toPurge = finalActive.slice(0, finalActive.length - MAX_ROTATION_SLOTS).map(h => h.symbol);
            finalHunts.forEach(h => {
                if (toPurge.includes(h.symbol) && h.strategyId === 'golden_rotation' && h.status === 'active') {
                    h.status = 'closed';
                    h.exitPrice = h.currentPrice || h.entryPrice;
                    h.exitTime = new Date().toISOString();
                    h.reason = 'Slot Capacity Purge (Self-Correction)';
                }
            });
            saveHunts(finalHunts);
        }

        log('Rotation', '✅', `Cycle done. Active: ${Math.min(finalActive.length, MAX_ROTATION_SLOTS)}/${MAX_ROTATION_SLOTS} | Candidates found: ${currentCandidates.length}`);

    } catch (err) {
        console.error('[Rotation] Error:', err.message);
    } finally {
        isScannerRunning = false;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  STRATEGY 1 & 2: GOLDEN SIGNAL + GOLDEN PRO SCANNER
// ═══════════════════════════════════════════════════════════════════

let alertedToday = { date: '', ids: [] };

async function runGoldenScanner() {
    log('Golden', '🔍', 'Starting Golden Signal + Pro Scan...');

    const config = loadConfig();
    if (!config.enabled) return;

    const today = new Date().toISOString().slice(0, 10);
    if (alertedToday.date !== today) alertedToday = { date: today, ids: [] };

    try {
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const topSymbols = res.data
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 450)
            .map(t => ({
                symbol: t.symbol.replace('USDT', ''),
                fullSymbol: t.symbol,
                price: parseFloat(t.lastPrice),
                change: parseFloat(t.priceChangePercent),
                volume: parseFloat(t.quoteVolume)
            }));

        for (const t of topSymbols) {
            if (alertedToday.ids.includes(t.symbol)) continue;

            const vwap = await getFullVwapData(t.symbol);
            if (!vwap) continue;

            // ─── 6-POINT GOLDEN CHECK ───
            const lastClose = vwap.last15mClose;
            const prevClose = vwap.prev15mClose;
            const cond1 = lastClose > vwap.prevWeekVwap;
            const cond2 = lastClose > vwap.currentWeekVwap;
            const cond3 = lastClose > vwap.max;
            const cond4 = vwap.currentWeekVwap > vwap.prevWeekVwap && vwap.prevWeekVwap > 0;
            const volatility = (Math.abs(vwap.max - vwap.min) / lastClose);
            const cond5 = volatility > 0.02;
            const cond6 = lastClose > vwap.max && prevClose <= vwap.max;
            const cond7 = vwap.currentWeekVwap > vwap.max;

            const isGolden = cond1 && cond2 && cond3 && cond4 && cond5 && cond6;
            const wasBelowRecently = vwap.history15m.slice(-5, -1).some(price => price <= vwap.max);
            const isCatchUp = cond1 && cond2 && cond3 && cond4 && cond5 && wasBelowRecently;
            const isDiamond = isGolden && cond7;

            // STRATEGY 1: GOLDEN SIGNAL
            if (t.volume > 500000 && (isGolden || isCatchUp)) {
                const entryType = isGolden ? (isDiamond ? 'Diamond' : 'Golden') : 'Catch-up';
                log('Golden', '🏆', `${entryType} SIGNAL: ${t.symbol} (Golden Signal)`);
                registerNewHunt(t.fullSymbol, lastClose, 'golden_signal');

                await sendTelegram([
                    isDiamond ? `💎 <b>⚡ DIAMOND BREAKOUT</b>` : `🏆 <b>⚡ GOLDEN SIGNAL</b>`,
                    ``,
                    `<b>Token:</b> ${t.symbol}/USDT`,
                    `<b>Price:</b> $${lastClose.toLocaleString()}`,
                    `<b>Strategy:</b> Original Golden`
                ].join('\n'));
            }

            // STRATEGY 2: GOLDEN PRO
            if (t.volume > 1200000 && (isGolden || isCatchUp)) {
                const entryType = isGolden ? (isDiamond ? 'Diamond' : 'Golden') : 'Catch-up';
                log('Golden', '💎', `${entryType} SIGNAL: ${t.symbol} (Golden Pro)`);
                registerNewHunt(t.fullSymbol, lastClose, 'golden_pro');

                await sendTelegram([
                    `💎 <b>⚡ GOLDEN PRO SIGNAL</b>`,
                    ``,
                    `<b>Token:</b> ${t.symbol}/USDT`,
                    `<b>Price:</b> $${lastClose.toLocaleString()}`,
                    `<b>Strategy:</b> Pro Risk Mgmt (-8% SL, +6% BE)`
                ].join('\n'));
            }

            alertedToday.ids.push(t.symbol);
            await new Promise(r => setTimeout(r, 100));
        }

        log('Golden', '✅', 'Golden Signal + Pro scan completed.');
    } catch (err) {
        console.error('[Golden] Error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  POSITION TRACKER (All Strategies)
// ═══════════════════════════════════════════════════════════════════

async function handleEarlyExit(hunt, exitPrice, strategyName, reason) {
    hunt.status = 'closed';
    hunt.exitPrice = exitPrice;
    hunt.exitTime = new Date().toISOString();
    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
    hunt.pnl = finalPnl;

    await sendTelegram([
        `🌤️ <b>${strategyName.toUpperCase()} EARLY EXIT: #${hunt.symbol}</b>`,
        ``,
        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()}`,
        `<b>Reason:</b> ${reason}`,
        ``,
        `💰 <i>Profit locked or loss minimized.</i>`
    ].join('\n'));

    const config = loadConfig();
    if (config.totalBalance !== undefined) {
        const pnlAmount = hunt.capital * (finalPnl / 100);
        config.totalBalance += pnlAmount;
        saveConfig(config);
        log('Tracker', '💰', `Balance: $${config.totalBalance.toFixed(2)} (PnL: $${pnlAmount.toFixed(2)})`);
    }

    log('Tracker', '🌤️', `EARLY EXIT ${hunt.symbol} (${strategyName}) | PnL: ${finalPnl.toFixed(2)}% | ${reason}`);
}

async function processActiveHunts() {
    if (isTrackerRunning) return;
    isTrackerRunning = true;

    try {
        const hunts = loadHunts();
        const active = hunts.filter(h => h.status === 'active');
        if (active.length === 0) {
            isTrackerRunning = false;
            return;
        }

        let modified = false;

        for (const hunt of active) {
            try {
                // Fetch last 2 candles
                const url = `https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=15m&limit=2`;
                const { data: klines } = await axios.get(url, { timeout: 10000 });

                if (!klines || klines.length < 2) continue;

                const candleClose = parseFloat(klines[0][4]);
                const livePrice = parseFloat(klines[1][4]);

                hunt.currentPrice = livePrice;
                modified = true;

                const decisionPrice = candleClose;

                if (decisionPrice > hunt.peakPrice) {
                    hunt.peakPrice = decisionPrice;
                }

                const currentProfitPct = (decisionPrice - hunt.entryPrice) / hunt.entryPrice;
                const peakProfitPct = (hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice;

                // ─── Strategy-Specific Risk Management ───
                let stopPrice = hunt.entryPrice * 0.95; // Default: -5%
                let trailDist = 0.05;
                let strategyName = "Golden Signal";

                if (hunt.strategyId === 'golden_pro') {
                    strategyName = "Golden Pro";
                    stopPrice = hunt.entryPrice * 0.92; // -8% SL
                    if (peakProfitPct >= 0.06) {
                        stopPrice = hunt.entryPrice * 1.005; // Break-even at +6%
                    }
                } else if (hunt.strategyId === 'golden_rotation') {
                    strategyName = "Golden Rotation";
                    stopPrice = hunt.entryPrice * 0.96; // -4% tight stop
                }

                // Tiered Trailing
                let newTier = 1;
                if (peakProfitPct >= 0.30) {
                    trailDist = 0.12; newTier = 3;
                } else if (hunt.strategyId === 'golden_pro' && peakProfitPct >= 0.15) {
                    trailDist = 0.08; newTier = 2;
                } else if (hunt.strategyId !== 'golden_pro' && peakProfitPct >= 0.10) {
                    trailDist = 0.07; newTier = 2;
                }

                const trailingStop = hunt.peakPrice * (1 - trailDist);
                if (peakProfitPct >= 0.10 && trailingStop > stopPrice) {
                    stopPrice = trailingStop;
                }

                // ─── INSTANT MOON-SHOT TP (+20%) ───
                const liveProfitPct = (livePrice - hunt.entryPrice) / hunt.entryPrice;
                if (liveProfitPct >= 0.20) {
                    log('Tracker', '🚀', `MOON-SHOT: ${hunt.symbol} at +${(liveProfitPct * 100).toFixed(2)}%`);
                    await handleEarlyExit(hunt, livePrice, strategyName, `Instant 20% Moon-Shot TP`);
                    continue;
                }

                // ─── EMERGENCY HARD STOP (LIVE) ───
                if (livePrice <= stopPrice) {
                    log('Tracker', '🚨', `EMERGENCY STOP: ${hunt.symbol} at $${livePrice} (Stop: $${stopPrice.toFixed(4)})`);

                    hunt.status = 'closed';
                    hunt.exitPrice = livePrice;
                    hunt.exitTime = new Date().toISOString();
                    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                    hunt.pnl = finalPnl;

                    const reason = stopPrice > hunt.entryPrice ? 'Take Profit/BE (Emergency)' : 'Hard Stop-Loss (Emergency)';

                    await sendTelegram([
                        `🚨 <b>${strategyName.toUpperCase()} EMERGENCY EXIT: #${hunt.symbol}</b>`,
                        ``,
                        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
                        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()} (LIVE)`,
                        `<b>Reason:</b> ${reason}`,
                        ``,
                        `🛡️ <i>Instant Protection Activated.</i>`
                    ].join('\n'));

                    const config = loadConfig();
                    if (config.totalBalance !== undefined) {
                        const pnlAmount = hunt.capital * (finalPnl / 100);
                        config.totalBalance += pnlAmount;
                        saveConfig(config);
                    }
                    continue;
                }

                // ─── MOMENTUM EXHAUSTION (RSI 5m) ───
                const url5m = `https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=5m&limit=20`;
                const { data: klines5m } = await axios.get(url5m, { timeout: 10000 });

                let rsi5m = 50;
                if (klines5m && klines5m.length >= 15) {
                    const closes = klines5m.map(k => parseFloat(k[4]));
                    let gains = 0, losses = 0;
                    for (let i = closes.length - 14; i < closes.length; i++) {
                        const diff = closes[i] - closes[i - 1];
                        if (diff >= 0) gains += diff; else losses -= diff;
                    }
                    rsi5m = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));
                }

                // ─── PEAK REVERSAL (Hyper-Scalp for Rotation) ───
                const isRotation = hunt.strategyId === 'golden_rotation';
                const triggerThreshold = isRotation ? 0.025 : 0.05;
                const reversalThreshold = isRotation ? 0.010 : 0.015;

                const reversalDist = (hunt.peakPrice - livePrice) / hunt.peakPrice;
                if (peakProfitPct >= triggerThreshold && reversalDist >= reversalThreshold) {
                    log('Tracker', '📉', `${isRotation ? 'HYPER-SCALP' : 'PEAK REVERSAL'}: ${hunt.symbol} (${(reversalDist * 100).toFixed(2)}% from peak)`);
                    await handleEarlyExit(hunt, livePrice, strategyName, isRotation ? 'Hyper-Scalp (Tighter Locking)' : 'Peak Reversal (Sliding TP)');
                    continue;
                }

                // ─── AVWAP TREND GUARD (Rotation Only) ───
                if (hunt.strategyId === 'golden_rotation') {
                    try {
                        const entryTs = new Date(hunt.entryTime).getTime();
                        const avwapUrl = `https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=15m&startTime=${entryTs}&limit=1000`;
                        const { data: avwapKlines } = await axios.get(avwapUrl, { timeout: 10000 });

                        if (avwapKlines && avwapKlines.length >= 2) {
                            let totalPV = 0, totalV = 0;
                            let prevAVWAP = hunt.lastVwapAnchor || 0;

                            for (const k of avwapKlines) {
                                const p = (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3;
                                const v = parseFloat(k[5]);
                                totalPV += p * v;
                                totalV += v;
                            }
                            const currentAVWAP = totalV > 0 ? totalPV / totalV : 0;

                            if (prevAVWAP > 0 && currentAVWAP < prevAVWAP && avwapKlines.length >= 3) {
                                log('Tracker', '📉', `AVWAP DOWNTURN: ${hunt.symbol} (${currentAVWAP.toFixed(4)} < ${prevAVWAP.toFixed(4)})`);
                                await handleEarlyExit(hunt, livePrice, strategyName, `AVWAP Slope Turned Negative`);
                                continue;
                            }

                            hunt.lastVwapAnchor = currentAVWAP;
                        }
                    } catch (e) {
                        console.error(`[Tracker] AVWAP Error for ${hunt.symbol}:`, e.message);
                    }
                }

                // ─── RSI EXHAUSTION ───
                const last5mClose = parseFloat(klines5m[klines5m.length - 2][4]);
                if (rsi5m >= 80 && livePrice < last5mClose) {
                    log('Tracker', '🥵', `RSI EXHAUSTION: ${hunt.symbol} (RSI: ${rsi5m.toFixed(1)})`);
                    await handleEarlyExit(hunt, livePrice, strategyName, `RSI Exhaustion (${rsi5m.toFixed(0)})`);
                    continue;
                }

                // Tier change alert
                if (newTier > (hunt.tier || 1)) {
                    log('Tracker', '🆙', `${hunt.symbol} upgraded to Tier ${newTier}`);
                    await sendTelegram([
                        `💎 <b>${strategyName.toUpperCase()} UPGRADE: TIER ${newTier}</b>`,
                        ``,
                        `<b>Symbol:</b> #${hunt.symbol}`,
                        `<b>Peak Profit:</b> +${(peakProfitPct * 100).toFixed(2)}%`,
                        `<b>Stop Level:</b> $${stopPrice.toLocaleString()} (${stopPrice > hunt.entryPrice ? 'PROTECTED' : 'AT RISK'})`,
                        ``,
                        `<i>Hunting for the Moon... 🚀</i>`
                    ].join('\n'));
                }
                hunt.tier = newTier;

                // Candle-close secondary exit
                if (decisionPrice <= stopPrice) {
                    hunt.status = 'closed';
                    hunt.exitPrice = decisionPrice;
                    hunt.exitTime = new Date().toISOString();
                    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                    hunt.pnl = finalPnl;

                    const reason = stopPrice > hunt.entryPrice ? 'Take Profit/BE' : 'Hard Stop Loss';

                    await sendTelegram([
                        `🔴 <b>${strategyName.toUpperCase()} CLOSED: #${hunt.symbol}</b>`,
                        ``,
                        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
                        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()}`,
                        `<b>Reason:</b> ${reason} (15m Close)`
                    ].join('\n'));

                    const config = loadConfig();
                    if (config.totalBalance !== undefined) {
                        const pnlAmount = hunt.capital * (finalPnl / 100);
                        config.totalBalance += pnlAmount;
                        saveConfig(config);
                    }
                }

                await new Promise(r => setTimeout(r, 200));

            } catch (err) {
                console.error(`[Tracker] Error updating ${hunt.symbol}:`, err.message);
            }
        }

        if (modified) {
            saveHunts(hunts);
        }

    } catch (err) {
        console.error('[Tracker] Error:', err.message);
    } finally {
        isTrackerRunning = false;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN — BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🛰️  VWAP ROTATION BOT — AUTONOMOUS MODE');
    console.log('  📡 Strategies: Golden Signal + Golden Pro + VWAP Rotation');
    console.log('  🕐 Scanner: 60s | Tracker: 10s | Golden: 2min');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'server', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Ensure hunts file exists
    if (!fs.existsSync(HUNTS_FILE)) {
        fs.writeFileSync(HUNTS_FILE, JSON.stringify([], null, 2));
    }

    // Ensure config file exists
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({
            botToken: '',
            chatId: '',
            enabled: true,
            totalBalance: 100.0
        }, null, 2));
    }

    const config = loadConfig();
    log('Boot', '💰', `Starting Balance: $${config.totalBalance?.toFixed(2) || '100.00'}`);

    const hunts = loadHunts();
    const activeHunts = hunts.filter(h => h.status === 'active');
    log('Boot', '📊', `Active positions: ${activeHunts.length}`);

    if (activeHunts.length > 0) {
        activeHunts.forEach(h => {
            log('Boot', '📍', `${h.symbol} (${h.strategyId}) — Entry: $${h.entryPrice}`);
        });
    }

    // Send boot notification
    await sendTelegram([
        `🛰️ <b>BOT STARTED — AUTONOMOUS MODE</b>`,
        ``,
        `<b>Strategies:</b> Golden Signal + Golden Pro + VWAP Rotation`,
        `<b>Balance:</b> $${config.totalBalance?.toFixed(2) || '100.00'}`,
        `<b>Active Positions:</b> ${activeHunts.length}`,
        `<b>Scanner:</b> Every 60s (Rotation) + 2min (Golden)`,
        `<b>Tracker:</b> Every 10s`,
        ``,
        `🟢 <i>All systems online.</i>`
    ].join('\n'));

    // ─── RUN INITIAL CYCLES ───
    log('Boot', '🚀', 'Running initial scan cycles...');

    // Schedule 1: VWAP Rotation Scanner (every 60 seconds)
    setInterval(async () => {
        try { await runRotationEngine(); } catch (e) { console.error('[Main] Rotation Error:', e.message); }
    }, SCAN_INTERVAL_MS);

    // Schedule 2: Position Tracker (every 10 seconds)
    setInterval(async () => {
        try { await processActiveHunts(); } catch (e) { console.error('[Main] Tracker Error:', e.message); }
    }, TRACKER_INTERVAL_MS);

    // Schedule 3: Golden Signal + Pro Scanner (every 2 minutes)
    setInterval(async () => {
        try { await runGoldenScanner(); } catch (e) { console.error('[Main] Golden Error:', e.message); }
    }, 2 * 60 * 1000);

    // Run immediately
    try { await runRotationEngine(); } catch (e) { console.error(e.message); }
    try { await processActiveHunts(); } catch (e) { console.error(e.message); }
    try { await runGoldenScanner(); } catch (e) { console.error(e.message); }

    log('Boot', '🟢', 'All systems online. Running 24/7...');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('');
    log('Shutdown', '🛑', 'Shutting down gracefully...');
    await sendTelegram(`🛑 <b>BOT STOPPED</b>\n\n<i>Manual shutdown detected.</i>`);
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    sendTelegram(`🔴 <b>BOT CRASH</b>\n\n<code>${err.message}</code>`);
});

process.on('unhandledRejection', (err) => {
    console.error('[FATAL] Unhandled Rejection:', err);
});

// 🚀 START
main();
