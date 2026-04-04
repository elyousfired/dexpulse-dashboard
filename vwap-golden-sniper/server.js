const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const WebSocket = require('ws');
const { EMA } = require('technicalindicators');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let ENGINE_CONFIG = {
    entryDistance: 2.00, // Maximum distance above VWAP to accept a breakout
    maxDailyPump: 10.00, // Maximum daily % gain permitted (to avoid buying tops)
    takeProfit: 1.50,
    stopLoss: -2.00,
    maxHoldSeconds: 300,
    maxTrades: 5,
    leverage: 10
};

let activeTrades = [];
let tradeHistory = [];
let tradeCooldowns = {};
let sessionPnl = 0;
let sessionPnlHistory = [{ time: Date.now(), pnl: 0 }]; // For Chart.js

let DATA = {
    btc: null,
    tokens: {},
    stats: {
        totalScan: 0,
        syncedCount: 0,
        approachingVWAP: 0,
        activeBreakouts: 0
    }
};

let topSymbols = [];
let wsConnection = null;

function getMidnightUTC() {
    const d = new Date();
    d.setUTCHours(0,0,0,0);
    return d.getTime();
}

async function fetchTopSymbols() {
    try {
        const res = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
        const validSymbols = res.data
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a,b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
        
        topSymbols = validSymbols.slice(0, 200).map(t => t.symbol);
        console.log(`✅ Fetched Top ${topSymbols.length} USDT symbols by Volume.`);
    } catch (err) {
        console.error("❌ Failed to fetch symbols:", err.message);
    }
}

async function bootstrap() {
    console.log("⏳ Bootstrapping EMAs and Daily VWAP for Golden Crosses...");
    const midnight = getMidnightUTC();
    const batchSize = 10;

    for (let i = 0; i < topSymbols.length; i += batchSize) {
        const batch = topSymbols.slice(i, i + batchSize);
        await Promise.all(batch.map(async (symbol) => {
            try {
                const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1500&startTime=${midnight}`);
                if (!res.data || res.data.length < 50) return;

                const prices = [];
                let cumulativeTipV = 0;
                let cumulativeVol = 0;
                let midnightPrice = 0;

                for (let j = 0; j < res.data.length; j++) {
                    const k = res.data[j];
                    const openPrice = parseFloat(k[1]); // First candle open price
                    const high = parseFloat(k[2]);
                    const low = parseFloat(k[3]);
                    const close = parseFloat(k[4]);
                    const volume = parseFloat(k[5]);
                    
                    if (j === 0) midnightPrice = openPrice; // Capture the very first candle open

                    const tip = (high + low + close) / 3;
                    cumulativeTipV += (tip * volume);
                    cumulativeVol += volume;
                    prices.push(close);
                }

                const ema20Values = EMA.calculate({ period: 20, values: prices });
                const ema50Values = EMA.calculate({ period: 50, values: prices });
                
                const ema20 = ema20Values.length > 0 ? ema20Values[ema20Values.length - 1] : prices[prices.length - 1];
                const ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : prices[prices.length - 1];
                const vwap = cumulativeVol > 0 ? (cumulativeTipV / cumulativeVol) : prices[prices.length - 1];
                const last = prices[prices.length - 1];

                const dailyChange = ((last - midnightPrice) / midnightPrice) * 100;

                DATA.tokens[symbol] = {
                    symbol, last, ema20, ema50, vwap, midnightPrice,
                    cumulativeTipV, cumulativeVol, dailyChange,
                    lastTickerVol24: null,
                    isAboveVwap: last > vwap,
                    isEmaUp: ema20 > ema50,
                    isEmaAboveVwap: ema20 > vwap,
                    justCrossedUp: false,
                    justCrossedDown: false,
                    dist: ((last - vwap) / vwap) * 100 // Visual distance
                };
            } catch (err) {
                if(err.response && err.response.status === 429) {
                    console.log(`⚠️ Rate Limited on ${symbol}`);
                }
            }
        }));
        if (i % 20 === 0) await new Promise(r => setTimeout(r, 1000));
    }
    DATA.stats.totalScan = Object.keys(DATA.tokens).length;
    console.log(`✅ Bootstrapping Golden Cross Engine completed.`);
}

function startStream() {
    if (wsConnection) wsConnection.close();
    wsConnection = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
    
    wsConnection.on('open', () => console.log("🟢 Connected to Binance WebSocket Stream."));
    
    wsConnection.on('message', (msg) => {
        const data = JSON.parse(msg);

        for (const t of data) {
            const sym = t.s;
            if (!DATA.tokens[sym]) continue;

            const tkData = DATA.tokens[sym];
            const currentPrice = parseFloat(t.c);
            const currentTotalV24 = parseFloat(t.v); 
            
            if (tkData.lastTickerVol24 !== null) {
                const deltaV = currentTotalV24 - tkData.lastTickerVol24;
                if (deltaV > 0) {
                    tkData.cumulativeTipV += (currentPrice * deltaV);
                    tkData.cumulativeVol += deltaV;
                    tkData.vwap = tkData.cumulativeTipV / tkData.cumulativeVol;
                } else if (deltaV < 0) {
                    tkData.lastTickerVol24 = currentTotalV24;
                }
            }
            tkData.lastTickerVol24 = currentTotalV24;

            const k20 = 2 / (20 + 1);
            tkData.ema20 = currentPrice * k20 + tkData.ema20 * (1 - k20);

            const k50 = 2 / (50 + 1);
            tkData.ema50 = currentPrice * k50 + tkData.ema50 * (1 - k50);

            tkData.last = currentPrice;
            tkData.dailyChange = ((currentPrice - tkData.midnightPrice) / tkData.midnightPrice) * 100;
            tkData.isAboveVwap = currentPrice > tkData.vwap;
            tkData.isEmaUp = tkData.ema20 > tkData.ema50;
            tkData.dist = ((currentPrice - tkData.vwap) / tkData.vwap) * 100;

            // Trend Crossing Detectors
            tkData.justCrossedUp = false;
            tkData.justCrossedDown = false;
            
            const currentEmaAboveVwap = tkData.ema20 > tkData.vwap;
            if (tkData.isEmaAboveVwap !== currentEmaAboveVwap) {
                if (currentEmaAboveVwap) tkData.justCrossedUp = true;
                else tkData.justCrossedDown = true;
                
                tkData.isEmaAboveVwap = currentEmaAboveVwap;
            }

            if (sym === 'BTCUSDT') DATA.btc = tkData;
        }

        executeTrades();
        broadcast();
    });

    wsConnection.on('close', () => setTimeout(startStream, 3000));
    wsConnection.on('error', (err) => console.error("⚠️ WS Error: " + err.message));
}

function executeTrades() {
    const now = Date.now();
    const btc = DATA.btc;
    if (!btc) return;
    
    // 1. Process active trades exits
    for (let i = activeTrades.length - 1; i >= 0; i--) {
        const trade = activeTrades[i];
        const currentData = DATA.tokens[trade.symbol];
        if (!currentData) continue;

        let pnlDist = trade.side === 'LONG' 
            ? ((currentData.last - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - currentData.last) / trade.entryPrice) * 100;
        
        trade.pnl = pnlDist * ENGINE_CONFIG.leverage;

        const isTP = trade.pnl >= ENGINE_CONFIG.takeProfit;
        const isSL = trade.pnl <= ENGINE_CONFIG.stopLoss;
        const holdSeconds = (now - trade.startTime) / 1000;
        const isTimeBailout = holdSeconds >= ENGINE_CONFIG.maxHoldSeconds && trade.pnl < 0;

        if (isTP || isSL || isTimeBailout) {
            trade.endTime = now;
            if (isTimeBailout) trade.status = `TIME_BAILOUT_${Math.floor(holdSeconds)}s`;
            else if (isSL) trade.status = 'STOP_LOSS';
            else trade.status = `TAKE_PROFIT_${ENGINE_CONFIG.takeProfit}%`;

            trade.exitPrice = currentData.last;            
            sessionPnl += trade.pnl;
            sessionPnlHistory.push({ time: now, pnl: sessionPnl }); // Track curve
            
            tradeHistory.unshift(trade);
            if (tradeHistory.length > 50) tradeHistory.pop();
            
            tradeCooldowns[trade.symbol] = now + 90000; // 90s cooldown to prevent multiple entries on minor oscillation
            activeTrades.splice(i, 1);
            console.log(`✅ [EXIT] ${trade.side} ${trade.symbol} closed at ${trade.pnl.toFixed(2)}% | Reason: ${trade.status}`);
        }
    }

    // 2. SANDBOX MODE: Top 10 High-Quality Correlated Coins
    if (activeTrades.length >= 10) return; // Strict 10 trades limit

    const btcTrendStatus = btc.isEmaUp; 
    
    // Sandbox is currently LONG-only, so only execute if BTC is Uptrend
    if (!btcTrendStatus) return;

    let candidates = Object.values(DATA.tokens).filter(t => {
        if (t.symbol === 'BTCUSDT') return false;
        if (activeTrades.some(a => a.symbol === t.symbol)) return false;
        
        // 1. Must be Correlated (Synced)
        if (t.isEmaUp !== btcTrendStatus) return false;
        
        // 2. Distance: Must be just above VWAP but not pumped too far yet (+0.1% to +1.5%)
        if (t.dist < 0.1 || t.dist > 1.5) return false;
        
        // 3. Daily Gain: Must be generally positive but not exhausted (+1% to +6%)
        if (t.dailyChange < 1.0 || t.dailyChange > 6.0) return false;
        
        // 4. Volume: High volume check ($10M minimum daily volume to avoid un-tradable traps)
        if (t.cumulativeTipV < 10000000) return false;

        return true;
    });

    // Sort by Highest Dollar Volume to pick the institutional favorites
    candidates.sort((a, b) => b.cumulativeTipV - a.cumulativeTipV);

    for (const t of candidates) {
        if (activeTrades.length >= 10) break;
        activeTrades.push({
            symbol: t.symbol,
            side: 'LONG',
            entryPrice: t.last,
            pnl: 0,
            startTime: now
        });
        
        console.log(`🔥 [SANDBOX] Opened Top-10 LONG on ${t.symbol} (Dist: ${t.dist.toFixed(2)}%, Vol: $${(t.cumulativeTipV/1e6).toFixed(1)}M)`);
    }
}

// Throttle broadcast slightly if needed, but WebSocket UI can handle 1000ms easy
function broadcast() {
    let approachingCount = 0;
    const watchlist = [];
    const btcTrendStatus = DATA.btc ? DATA.btc.isEmaUp : null;

    for (const sym in DATA.tokens) {
        if (sym === 'BTCUSDT') continue;
        const tk = DATA.tokens[sym];
        
        // Ema VWAP Distance tracker for Watchlist
        const emaDist = ((tk.ema20 - tk.vwap) / tk.vwap) * 100;
        
        if (btcTrendStatus === true) {
            // Approaching Long Cross: EMA is below VWAP, but closing in (>-1.0%)
            if (!tk.isEmaAboveVwap && emaDist > -1.0) { approachingCount++; watchlist.push(tk); }
        }
    }
    
    // Sort Watchlist by closest to crossing VWAP
    watchlist.sort((a, b) => Math.abs(((a.ema20 - a.vwap) / a.vwap) * 100) - Math.abs(((b.ema20 - b.vwap) / b.vwap) * 100));

    DATA.stats.approachingVWAP = approachingCount;
    DATA.stats.activeBreakouts = activeTrades.length;

    // Attach current live price to active trades payload
    const enrichedActive = activeTrades.map(a => ({
        ...a,
        livePrice: DATA.tokens[a.symbol] ? DATA.tokens[a.symbol].last : a.entryPrice
    }));

    const payload = {
        btc: DATA.btc,
        watchlist: watchlist.slice(0, 30),
        stats: DATA.stats,
        activeTrades: enrichedActive,
        history: tradeHistory,
        sessionPnl,
        sessionPnlHistory,
        config: ENGINE_CONFIG
    };
    
    io.emit('breakout-update', payload);
}

io.on('connection', (socket) => {
    socket.on('update-config', (newConf) => {
        ENGINE_CONFIG = { ...ENGINE_CONFIG, ...newConf };
    });
});

async function boot() {
    await fetchTopSymbols();
    await bootstrap();
    startStream();
}

server.listen(3010, () => {
    console.log("🚀 VWAP Golden Sniper live on port 3010");
    boot();
});
