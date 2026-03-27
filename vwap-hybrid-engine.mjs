#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🛰️  VWAP HYBRID ENGINE — UNIFIED SNIPER & TURBO (Turbo V2)
 *  📊  Logic: High Density (>=85%) = Sniper (30% Cap) | Else = Turbo (2% Cap)
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
    scanIntervalMs:    60 * 1000,    
    trackerIntervalMs: 10 * 1000,    
    apiDelayMs:        60,           

    // Fleet Architecture (Total 50 Slots)
    maxTotalSlots: 50,
    maxSniperSlots: 3,  // Heavy Capital slots (Condition A)

    // Capital Allocation %
    sniperAllocationPct: 0.30, // 30% of total balance per Sniper
    turboAllocationPct:  0.02, // 2% of total balance per Turbo

    // Entry Filters
    maxDistancePct:    0.015,
    minVolume24h:      1_000_000,
    entryRsiMin:       45,
    entryRsiMax:       65,
    sniperDensityTrigger: 85, // Density >= 85 triggers Sniper Mode

    // Exit: Stop Loss & Trailing (Proven Saturday Logic)
    hardStopPct: 0.05,
    tier2TriggerPct:   0.08, // +8% peak -> Lock 5% trail
    tier3TriggerPct:   0.20, // +20% peak -> Lock 10% trail
    tier4TriggerPct:   0.40, // +40% peak -> Lock 15% trail

    cooldownMs: 4 * 60 * 60 * 1000,
    vwapCacheDurationMs: 15 * 60 * 1000
};

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 2: STATE & I/O                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

let isScannerRunning = false;
let isTrackerRunning = false;
const vwapCache = new Map();

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG.configFile)) return JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf8'));
    } catch (e) {}
    return { botToken: '', chatId: '', enabled: true, totalBalance: 100.0 };
}

function loadHunts() {
    try {
        if (fs.existsSync(CONFIG.huntsFile)) {
            const content = fs.readFileSync(CONFIG.huntsFile, 'utf8').trim();
            return content ? JSON.parse(content) : [];
        }
    } catch (e) {}
    return [];
}

function saveHunts(hunts) { fs.writeFileSync(CONFIG.huntsFile, JSON.stringify(hunts, null, 2)); }

function log(tag, emoji, msg) {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`[${time}] [${tag}] ${emoji} ${msg}`);
}

async function sendTelegram(text) {
    const config = loadConfig();
    if (!config.enabled || !config.botToken || !config.chatId) return;
    const chatIds = config.chatId.split(',').map(id => id.trim());
    for (const id of chatIds) {
        try {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
                chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true
            });
        } catch (err) {}
    }
}

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 3: DATA FETCHING                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

async function fetchKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await axios.get(url, { timeout: 10000 });
        return res.data.map(d => ({
            time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function fetchTopSymbols(topN = 300) {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 15000 });
    return res.data
        .filter(t => t.symbol.endsWith('USDT'))
        .filter(t => parseFloat(t.quoteVolume) >= CONFIG.minVolume24h)
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, topN).map(t => t.symbol);
}

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 4: VWAP & DENSITY                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

function getMondayTimestamp(ts) {
    const d = new Date(ts);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const mon = new Date(ts);
    mon.setUTCHours(0, 0, 0, 0);
    mon.setUTCDate(mon.getUTCDate() - diff);
    return Math.floor(mon.getTime() / 1000);
}

async function calculateVwapChannel(symbol) {
    const now = Date.now();
    const cached = vwapCache.get(symbol);
    if (cached && cached.expires > now) return cached;

    const dailyKlines = await fetchKlines(symbol, '1d', 30);
    if (dailyKlines.length < 15) return null;

    const mondayTs = getMondayTimestamp(now);
    let wMax = -Infinity, wMin = Infinity;
    const dailyVwaps = dailyKlines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    dailyKlines.forEach((k, idx) => {
        if (getMondayTimestamp(k.time) === mondayTs && idx < dailyKlines.length - 1) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
        }
    });

    const mid = dailyVwaps[dailyVwaps.length - 1];
    if (wMax === -Infinity) { wMax = mid; wMin = mid; }
    
    const k15 = await fetchKlines(symbol, '15m', 1);
    const last15mClose = k15[0]?.close || mid;

    const result = { max: wMax, min: wMin, mid, last15mClose, expires: now + CONFIG.vwapCacheDurationMs };
    vwapCache.set(symbol, result);
    return result;
}

function calculateDensity(max, mid, min) {
    const avg = (max + mid + min) / 3;
    const diff = (Math.abs(max - avg) + Math.abs(mid - avg) + Math.abs(min - avg)) / 3;
    return Math.max(0, Math.round(100 * (1 - (diff / (avg * 0.02)))));
}

async function fetchRSI5m(symbol) {
    const klines = await fetchKlines(symbol, '5m', 20);
    if (klines.length < 15) return { rsi: 50 };
    const closes = klines.map(k => k.close);
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));
    return { rsi };
}

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 5: HYBRID LOGIC & LOOPS                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

async function runHybridScanner() {
    if (isScannerRunning) return;
    isScannerRunning = true;
    try {
        const config = loadConfig();
        const balance = config.totalBalance || 100.0;
        const allHunts = loadHunts();
        let activeHunts = allHunts.filter(h => h.status === 'active');
        
        let sniperCount = activeHunts.filter(h => h.mode === 'Sniper').length;
        let turboCount = activeHunts.filter(h => h.mode === 'Turbo' || !h.mode).length;

        if (activeHunts.length >= CONFIG.maxTotalSlots) return;

        const symbols = await fetchTopSymbols(300);
        for (const symbol of symbols) {
            if (activeHunts.length >= CONFIG.maxTotalSlots) break;
            if (allHunts.find(h => h.symbol === symbol && h.status === 'active')) continue;

            const vwap = await calculateVwapChannel(symbol);
            if (!vwap || vwap.mid <= vwap.max) continue;
            
            const dist = (vwap.last15mClose - vwap.mid) / vwap.mid;
            if (dist > CONFIG.maxDistancePct) continue;

            const { rsi } = await fetchRSI5m(symbol);
            if (rsi < CONFIG.entryRsiMin || rsi > CONFIG.entryRsiMax) continue;

            const density = calculateDensity(vwap.max, vwap.mid, vwap.min);
            
            // DUAL-MODE LOGIC
            let mode = 'Turbo';
            let allocation = CONFIG.turboAllocationPct;
            
            if (density >= CONFIG.sniperDensityTrigger && sniperCount < CONFIG.maxSniperSlots) {
                mode = 'Sniper';
                allocation = CONFIG.sniperAllocationPct;
                sniperCount++;
            } else {
                turboCount++;
            }

            const capital = Math.floor((balance * allocation) * 100) / 100;
            const entryPrice = vwap.last15mClose;
            
            const newHunt = {
                symbol, entryPrice, entryTime: new Date().toISOString(),
                peakPrice: entryPrice, status: 'active', strategyId: 'vwap_hybrid',
                mode, density, capital, tier: 1
            };
            
            allHunts.push(newHunt);
            saveHunts(allHunts);
            activeHunts.push(newHunt);
            
            log('Entry', mode === 'Sniper' ? '🎯' : '🚀', `${mode.toUpperCase()} ENTRY: ${symbol} at $${entryPrice} | Density: ${density}% | Cap: $${capital}`);
            await sendTelegram(`${mode === 'Sniper' ? '🎯' : '🚀'} <b>VWAP HYBRID ${mode.toUpperCase()}: #${symbol}</b>\nPrice: $${entryPrice}\nDensity: ${density}%\nCapital: $${capital}`);
            
            await new Promise(r => setTimeout(r, CONFIG.apiDelayMs));
        }
    } finally { isScannerRunning = false; }
}

async function runHybridTracker() {
    if (isTrackerRunning) return;
    isTrackerRunning = true;
    try {
        const hunts = loadHunts();
        const active = hunts.filter(h => h.status === 'active' && h.strategyId === 'vwap_hybrid');
        for (const hunt of active) {
            const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=15m&limit=2`);
            if (!res.data[1]) continue;
            
            const candleClose = parseFloat(res.data[0][4]);
            const livePrice = parseFloat(res.data[1][4]);
            
            hunt.currentPrice = livePrice;
            if (candleClose > hunt.peakPrice) hunt.peakPrice = candleClose;

            const peakGain = (hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice;
            let stopPrice = hunt.entryPrice * (1 - CONFIG.hardStopPct);
            let trail = 0.05, tier = 1;

            if (peakGain >= CONFIG.tier4TriggerPct) { trail = 0.15; tier = 4; }
            else if (peakGain >= CONFIG.tier3TriggerPct) { trail = 0.10; tier = 3; }
            else if (peakGain >= CONFIG.tier2TriggerPct) { trail = 0.05; tier = 2; }

            if (peakGain >= 0.04) {
                const ts = hunt.peakPrice * (1 - trail);
                if (ts > stopPrice) stopPrice = ts;
            }

            if (livePrice <= stopPrice) {
                hunt.status = 'closed';
                hunt.exitPrice = livePrice;
                hunt.exitTime = new Date().toISOString();
                const pnl = ((livePrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                
                // Update Balance
                const config = loadConfig();
                const profitAmount = hunt.capital * (pnl / 100);
                config.totalBalance = (config.totalBalance || 100.0) + profitAmount;
                fs.writeFileSync(CONFIG.configFile, JSON.stringify(config, null, 2));

                log('Exit', '💸', `CLOSED ${hunt.symbol} | PnL: ${pnl.toFixed(2)}% | Net: $${profitAmount.toFixed(2)}`);
                await sendTelegram(`🔴 <b>HYBRID EXIT: #${hunt.symbol}</b>\nMode: ${hunt.mode || 'Turbo'}\nPnL: ${pnl.toFixed(2)}%\nBalance: $${config.totalBalance.toFixed(2)}`);
            } else if (tier > hunt.tier) {
                hunt.tier = tier;
                await sendTelegram(`💎 <b>TIER ${tier} UPGRADE: #${hunt.symbol}</b>`);
            }
        }
        saveHunts(hunts);
    } catch (err) { log('Tracker', '❌', err.message); }
    finally { isTrackerRunning = false; }
}

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ║  BOOT                                                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════════╝

log('Boot', '⚔️', 'Hybrid Double-Engine V2 Starting...');
setInterval(runHybridScanner, CONFIG.scanIntervalMs);
setInterval(runHybridTracker, CONFIG.trackerIntervalMs);
runHybridScanner(); runHybridTracker();
