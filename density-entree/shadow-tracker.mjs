/**
 * Shadow Portfolio Tracker
 * ========================
 * Mirrors VWAP rotation entries but NEVER exits.
 * Tracks peak PnL for each position.
 * 
 * Run: node density-entree/shadow-tracker.mjs
 * PM2: pm2 start density-entree/shadow-tracker.mjs --name shadow-tracker
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHADOW_FILE = path.join(__dirname, 'shadow_positions.json');
const HUNTS_FILE = path.resolve(__dirname, '..', 'server', 'data', 'active_hunts.json');

const CONFIG = {
    scanIntervalMs: 30_000,      // Check for new entries every 30s
    priceUpdateMs: 30_000,       // Update prices every 30s
    binanceApi: 'https://fapi.binance.com/fapi/v1/ticker/price',
};

// ─── Data Helpers ───

function loadShadow() {
    try {
        if (fs.existsSync(SHADOW_FILE)) {
            return JSON.parse(fs.readFileSync(SHADOW_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Shadow] Error loading shadow file:', e.message);
    }
    return [];
}

function saveShadow(positions) {
    try {
        fs.writeFileSync(SHADOW_FILE, JSON.stringify(positions, null, 2));
    } catch (e) {
        console.error('[Shadow] Error saving shadow file:', e.message);
    }
}

function loadHunts() {
    try {
        if (fs.existsSync(HUNTS_FILE)) {
            return JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Shadow] Error loading hunts:', e.message);
    }
    return [];
}

async function fetchPrices() {
    try {
        const res = await fetch(CONFIG.binanceApi);
        const data = await res.json();
        const prices = {};
        for (const p of data) {
            prices[p.symbol] = parseFloat(p.price);
        }
        return prices;
    } catch (e) {
        console.error('[Shadow] Error fetching prices:', e.message);
        return {};
    }
}

function log(emoji, msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${ts}] [Shadow] ${emoji} ${msg}`);
}

// ─── Core Logic ───

function checkForNewEntries(shadow) {
    const hunts = loadHunts();
    const rotationEntries = hunts.filter(h =>
        h.strategyId === 'golden_rotation' &&
        h.entryTime &&
        h.entryPrice
    );

    let newCount = 0;

    for (const hunt of rotationEntries) {
        // Unique key = symbol + entryTime
        const exists = shadow.some(s =>
            s.symbol === hunt.symbol &&
            s.entryTime === hunt.entryTime
        );

        if (!exists) {
            const shadowPos = {
                symbol: hunt.symbol,
                entryPrice: hunt.entryPrice,
                entryTime: hunt.entryTime,
                currentPrice: hunt.currentPrice || hunt.entryPrice,
                peakPrice: hunt.peakPrice || hunt.entryPrice,
                peakPnl: 0,
                currentPnl: 0,
                density: hunt.density || 0,
                entryRsi: hunt.entryRsi || null,
                entryDistance: hunt.entryDistance || null,
                entryReason: hunt.entryReason || null,
                trackedSince: new Date().toISOString(),
            };

            // Calculate initial PnL
            if (hunt.currentPrice) {
                shadowPos.currentPnl = ((hunt.currentPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
            }
            if (hunt.peakPrice) {
                shadowPos.peakPnl = ((hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
            }

            shadow.push(shadowPos);
            newCount++;
            log('📥', `NEW: ${hunt.symbol} @ $${hunt.entryPrice} | Density: ${hunt.density || 0}%`);
        }
    }

    if (newCount > 0) {
        log('✅', `Added ${newCount} new positions (total: ${shadow.length})`);
    }

    return shadow;
}

async function updatePrices(shadow) {
    if (shadow.length === 0) return shadow;

    const prices = await fetchPrices();
    if (Object.keys(prices).length === 0) return shadow;

    let updated = 0;
    let newPeaks = 0;

    for (const pos of shadow) {
        const livePrice = prices[pos.symbol];
        if (!livePrice) continue;

        pos.currentPrice = livePrice;
        pos.currentPnl = ((livePrice - pos.entryPrice) / pos.entryPrice) * 100;

        // Update peak
        if (livePrice > pos.peakPrice) {
            pos.peakPrice = livePrice;
            pos.peakPnl = ((livePrice - pos.entryPrice) / pos.entryPrice) * 100;
            newPeaks++;
        }

        pos.lastUpdate = new Date().toISOString();
        updated++;
    }

    if (newPeaks > 0) {
        log('🏔️', `${newPeaks} new peaks! Top: ${shadow.sort((a, b) => b.peakPnl - a.peakPnl).slice(0, 3).map(p => `${p.symbol.replace('USDT', '')}(+${p.peakPnl.toFixed(1)}%)`).join(', ')}`);
    }

    return shadow;
}

// ─── Stats ───

function printStats(shadow) {
    if (shadow.length === 0) {
        log('📊', 'No positions yet');
        return;
    }

    const totalCurrentPnl = shadow.reduce((s, p) => s + p.currentPnl, 0);
    const totalPeakPnl = shadow.reduce((s, p) => s + p.peakPnl, 0);
    const avgPeakPnl = totalPeakPnl / shadow.length;
    const bestPeak = shadow.reduce((best, p) => p.peakPnl > best.peakPnl ? p : best, shadow[0]);
    const positive = shadow.filter(p => p.currentPnl > 0).length;

    log('📊', `Positions: ${shadow.length} | Current: ${totalCurrentPnl >= 0 ? '+' : ''}${totalCurrentPnl.toFixed(2)}% | Peak Sum: +${totalPeakPnl.toFixed(2)}% | Avg Peak: +${avgPeakPnl.toFixed(2)}%`);
    log('🏆', `Best Peak: ${bestPeak.symbol} +${bestPeak.peakPnl.toFixed(2)}% | Currently Positive: ${positive}/${shadow.length}`);
}

// ─── Main Loop ───

async function mainLoop() {
    log('🚀', 'Shadow Tracker started');
    log('📂', `Hunts: ${HUNTS_FILE}`);
    log('📂', `Shadow: ${SHADOW_FILE}`);

    let shadow = loadShadow();
    log('📥', `Loaded ${shadow.length} existing shadow positions`);

    // Initial sync
    shadow = checkForNewEntries(shadow);
    shadow = await updatePrices(shadow);
    saveShadow(shadow);
    printStats(shadow);

    // Main loop
    setInterval(async () => {
        try {
            shadow = loadShadow(); // Reload in case of external edits
            shadow = checkForNewEntries(shadow);
            shadow = await updatePrices(shadow);
            saveShadow(shadow);
        } catch (e) {
            log('❌', `Error: ${e.message}`);
        }
    }, CONFIG.scanIntervalMs);

    // Print stats every 5 minutes
    setInterval(() => {
        const s = loadShadow();
        printStats(s);
    }, 5 * 60_000);
}

mainLoop();
