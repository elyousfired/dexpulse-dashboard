const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const WebSocket = require('ws');
const { EMA } = require('technicalindicators');

const app = express();
app.use(cors());
app.use(express.static('public'));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 3007;

// --- State ---
let symbols = [];
let tokenData = {}; // { symbol: { last, ema9, ema20, vwap, dist, signal, overextended } }
let activeHunts = []; // Array of { pair: [symA, symB], entryGap, currentGap, entryPrices: {}, pnl, startTime }
let huntHistory = []; // Last 10 closed hunts
let huntCooldowns = {}; // { pairKey: timestamp }
let lastUpdate = Date.now();

// --- Utils: Fetch Top 20 Symbols by Volume ---
async function fetchTopSymbols() {
    try {
        const res = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
        symbols = res.data
            .filter(t => t.symbol.endsWith('USDT'))
            .filter(t => !t.symbol.includes('XAG') && !t.symbol.includes('XAU') && !t.symbol.includes('INDEX'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 20)
            .map(t => t.symbol);
        
        console.log(`📡 Monitoring Top 20: ${symbols.join(', ')}`);
    } catch (e) {
        console.error('❌ Symbol Fetch Error:', e.message);
    }
}

// --- Utils: Bootstrap Data (EMA & VWAP) ---
async function bootstrap() {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const startTs = midnight.getTime();

    console.log(`⏳ Bootstrapping ${symbols.length} symbols...`);

    const tasks = symbols.map(async (symbol) => {
        try {
            // Fetch 500 1m klines for stable EMA and intraday VWAP
            const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=500`, { timeout: 10000 });
            if (!res.data || res.data.length < 20) return;

            const prices = res.data.map(k => parseFloat(k[4]));
            
            // EMA Calculation
            const ema9Values = EMA.calculate({ period: 9, values: prices });
            const ema20Values = EMA.calculate({ period: 20, values: prices });
            
            const ema9 = ema9Values[ema9Values.length - 1];
            const ema20 = ema20Values[ema20Values.length - 1];
            
            // VWAP (Intraday from Midnight)
            // Filter klines since midnight
            const todayKlines = res.data.filter(k => parseInt(k[0]) >= startTs);
            let totalVol = 0, totalQuoteVol = 0;
            todayKlines.forEach(k => {
                totalVol += parseFloat(k[5]);
                totalQuoteVol += parseFloat(k[7]);
            });
            
            const last = prices[prices.length - 1];
            const vwap = totalVol > 0 ? (totalQuoteVol / totalVol) : last;
            const dist = ((ema9 - ema20) / ema20) * 100;

            tokenData[symbol] = {
                last,
                ema9,
                ema20,
                vwap,
                dist,
                signal: getSignal(dist),
                overextended: Math.abs(dist) > 4
            };

            console.log(`✅ ${symbol} Initialized: Dist ${dist.toFixed(2)}%`);
        } catch (e) {
            console.error(`❌ Bootstrap ${symbol} Error:`, e.message);
        }
    });

    await Promise.all(tasks);
}

function getSignal(dist) {
    if (dist > 2) return "strong bullish";
    if (dist < -2) return "strong bearish";
    if (dist > 0.5 && dist < 1.5) return "entry";
    if (Math.abs(dist) < 0.3) return "neutral";
    return dist > 0 ? "bullish" : "bearish";
}

// --- Real-time Stream ---
let binanceWs;
function startStream() {
    if (binanceWs) binanceWs.terminate();

    const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://fstream.binance.com/stream?streams=${streams}`;
    
    binanceWs = new WebSocket(url);

    binanceWs.on('message', (msgStr) => {
        try {
            const raw = JSON.parse(msgStr);
            if (!raw.data) return;

            const data = raw.data;
            const s = data.s;
            const price = parseFloat(data.c);

            if (tokenData[s]) {
                const t = tokenData[s];
                t.last = price;
                
                // Simple EMA approximation for real-time (EMA = (Price - PrevEMA) * K + PrevEMA)
                const k9 = 2 / (9 + 1);
                const k20 = 2 / (20 + 1);
                
                t.ema9 = (price - t.ema9) * k9 + t.ema9;
                t.ema20 = (price - t.ema20) * k20 + t.ema20;
                
                t.dist = ((t.ema9 - t.ema20) / t.ema20) * 100;
                t.signal = getSignal(t.dist);
                t.overextended = Math.abs(t.dist) > 4;

                // "Pro Level" Logic check
                t.proSignal = null;
                if (t.dist > 2 && price > t.vwap) t.proSignal = "OVERBOUGHT (SHORT)";
                if (t.dist < -2 && price < t.vwap) t.proSignal = "OVERSOLD (LONG)";

                lastUpdate = Date.now();
                runArbitrageEngine(); // Scan for new opportunities or update existing ones
                broadcast();
            }
        } catch (e) {
            console.error('⚠️ Stream Error:', e.message);
        }
    });

    binanceWs.on('close', () => setTimeout(startStream, 5000));
}

// --- Logic: Arbitrage Execution Engine (Simulated) ---
function runArbitrageEngine() {
    const list = Object.keys(tokenData).map(s => ({ symbol: s, ...tokenData[s] }));
    if (list.length < 2) return;

    // 1. Update Existing Hunts
    activeHunts = activeHunts.filter(h => {
        const t1 = tokenData[h.pair[0]];
        const t2 = tokenData[h.pair[1]];
        if (!t1 || !t2) return false;

        // Current Gap
        h.currentGap = Math.abs(t1.dist - t2.dist);

        // PnL Calculation (Short T1, Long T2)
        // PnL_Pct = (Entry_Price_1 / Current_Price_1 - 1) + (Current_Price_2 / Entry_Price_2 - 1)
        const p1_pnl = (h.entryPrices[h.pair[0]] / t1.last - 1) * 100;
        const p2_pnl = (t2.last / h.entryPrices[h.pair[1]] - 1) * 100;
        h.pnl = p1_pnl + p2_pnl;

        // Exit Condition: Gap closed by at least 50% relative to entry gap
        // Example: Entry Gap 0.4%, Exit Gap < 0.2%. This guarantees the trade had room to profit.
        const duration = (Date.now() - h.startTime) / 1000;
        
        // Target Exit Gap (50% of original gap, or hard cap of 0.15%)
        const targetExitGap = Math.min(h.entryGap * 0.5, 0.15);

        // Also add a Safety Stop-Loss (e.g. if PnL is worse than -1.5%)
        const isStopLoss = h.pnl < -1.5;

        if ((h.currentGap < targetExitGap && duration > 5) || isStopLoss) {
            h.endTime = Date.now();
            h.status = isStopLoss ? 'stopped_out' : 'closed_profit';
            
            // Set cooldown for this pair (30 seconds)
            const pairId = h.pair.sort().join('_');
            huntCooldowns[pairId] = Date.now() + 30000;

            huntHistory.unshift(h);
            if (huntHistory.length > 10) huntHistory.pop();
            console.log(`✅ [EXIT] Arbitrage Hunt Closed: ${h.pair.join('/')} | PnL: ${h.pnl.toFixed(2)}%`);
            return false;
        }
        return true;
    });

    // 2. Scan for New Hunt if slot available (Limit 3 hunts at a time)
    if (activeHunts.length < 3) {
        list.sort((a,b) => b.dist - a.dist);
        const top = list[0];
        const bottom = list[list.length - 1];
        const gap = Math.abs(top.dist - bottom.dist);

        // Entry Condition: Gap > 0.2% (Increased to reduce noise)
        if (gap > 0.2) {
            const pairKey = [top.symbol, bottom.symbol].sort().join('_');
            const isOnCooldown = huntCooldowns[pairKey] && Date.now() < huntCooldowns[pairKey];
            const exists = activeHunts.some(h => {
                const hKey = h.pair.sort().join('_');
                return hKey === pairKey;
            });

            if (!exists && !isOnCooldown) {
                activeHunts.push({
                    pair: [top.symbol, bottom.symbol],
                    entryGap: gap,
                    currentGap: gap,
                    entryPrices: {
                        [top.symbol]: top.last,
                        [bottom.symbol]: bottom.last
                    },
                    pnl: 0,
                    startTime: Date.now()
                });
                console.log(`🔥 [ENTRY] New Arbitrage Hunt: Short ${top.symbol} / Long ${bottom.symbol} | Gap: ${gap.toFixed(2)}%`);
            }
        }
    }
}

function broadcast() {
    const report = Object.keys(tokenData).map(s => ({
        symbol: s,
        ...tokenData[s]
    })).sort((a,b) => Math.abs(b.dist) - Math.abs(a.dist));
    
    io.emit('ema-update', { tokens: report, hunts: activeHunts, history: huntHistory });
}

// --- Bootstrap ---
async function boot() {
    await fetchTopSymbols();
    await bootstrap();
    startStream();
    server.listen(PORT, () => console.log(`🚀 EMA-VWAP Scanner live on port ${PORT}`));
}

boot();
