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
    entryDistance: 0.45,
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
let winCount = 0;
let lossCount = 0;

io.on('connection', (socket) => {
    socket.on('update-config', (newConf) => {
        ENGINE_CONFIG = { ...ENGINE_CONFIG, ...newConf };
    });
});

const DATA = {
    btc: null,
    tokens: {},
    synced: [],
    inverse: [],
    stats: {
        totalScan: 0,
        syncedCount: 0,
        inverseCount: 0,
        unalignedCount: 0
    }
};

let topSymbols = [];
let wsConnection = null;

// Helper: Midnight UTC
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
        
        // Take top 200 (including BTCUSDT)
        topSymbols = validSymbols.slice(0, 200).map(t => t.symbol);
        console.log(`✅ Fetched Top ${topSymbols.length} USDT symbols by Volume.`);
    } catch (err) {
        console.error("❌ Failed to fetch symbols:", err.message);
    }
}

async function bootstrap() {
    console.log("⏳ Bootstrapping EMAs and Daily VWAP. This may take 1-2 minutes...");
    const midnight = getMidnightUTC();
    const batchSize = 10;

    for (let i = 0; i < topSymbols.length; i += batchSize) {
        const batch = topSymbols.slice(i, i + batchSize);
        await Promise.all(batch.map(async (symbol) => {
            try {
                // Fetch up to 1500 1m klines since midnight
                const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1500&startTime=${midnight}`);
                
                if (!res.data || res.data.length < 50) return; // Ignore if data is insufficient

                const prices = [];
                let cumulativeTipV = 0;   // Cumulative TypicalPrice * Volume
                let cumulativeVol = 0;    // Cumulative Volume

                for (const k of res.data) {
                    const high = parseFloat(k[2]);
                    const low = parseFloat(k[3]);
                    const close = parseFloat(k[4]);
                    const volume = parseFloat(k[5]);
                    
                    const tip = (high + low + close) / 3;
                    cumulativeTipV += (tip * volume);
                    cumulativeVol += volume;
                    
                    prices.push(close);
                }

                // Compute EMAs
                const ema20Values = EMA.calculate({ period: 20, values: prices });
                const ema50Values = EMA.calculate({ period: 50, values: prices });
                
                const ema20 = ema20Values.length > 0 ? ema20Values[ema20Values.length - 1] : prices[prices.length - 1];
                const ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : prices[prices.length - 1];
                const vwap = cumulativeVol > 0 ? (cumulativeTipV / cumulativeVol) : prices[prices.length - 1];
                const last = prices[prices.length - 1];

                DATA.tokens[symbol] = {
                    symbol,
                    last,
                    ema20,
                    ema50,
                    vwap,
                    cumulativeTipV,
                    cumulativeVol,
                    lastTickerVol24: null,   // Will be tracking 24hr V delta to update VWAP tick-by-tick
                    isAboveVwap: last > vwap,
                    isEmaUp: ema20 > ema50
                };
            } catch (err) {
                // Ignore API bans minimally
                if(err.response && err.response.status === 429) {
                    console.log(`⚠️ Rate Limited on ${symbol}, sleeping...`);
                }
            }
        }));
        
        // Anti-Ban minor sleep
        if (i % 20 === 0) await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`✅ Bootstrapping completed for ${Object.keys(DATA.tokens).length} symbols.`);
    DATA.stats.totalScan = Object.keys(DATA.tokens).length;
}

function startStream() {
    if (wsConnection) wsConnection.close();
    
    wsConnection = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
    
    wsConnection.on('open', () => {
        console.log("🟢 Connected to Binance WebSocket Stream.");
    });
    
    wsConnection.on('message', (msg) => {
        const data = JSON.parse(msg);
        let btcData = null;

        // Process Incoming Ticks
        for (const t of data) {
            const sym = t.s;
            if (!DATA.tokens[sym]) continue;

            const tkData = DATA.tokens[sym];
            const currentPrice = parseFloat(t.c);
            const currentTotalV24 = parseFloat(t.v); // Current 24h string volume
            
            // --- High-Frequency VWAP Update Logic ---
            if (tkData.lastTickerVol24 !== null) {
                const deltaV = currentTotalV24 - tkData.lastTickerVol24;
                if (deltaV > 0) {
                    // For ticks, closing price is a close approx to typical price
                    tkData.cumulativeTipV += (currentPrice * deltaV);
                    tkData.cumulativeVol += deltaV;
                    tkData.vwap = tkData.cumulativeTipV / tkData.cumulativeVol;
                } else if (deltaV < 0) {
                    // Occurs exact at 00:00 UTC or 24hr rolling decay, reset tracker
                    tkData.lastTickerVol24 = currentTotalV24;
                }
            }
            tkData.lastTickerVol24 = currentTotalV24; // Track for next tick

            // --- EMA Smoothing ---
            const k20 = 2 / (20 + 1);
            tkData.ema20 = currentPrice * k20 + tkData.ema20 * (1 - k20);

            const k50 = 2 / (50 + 1);
            tkData.ema50 = currentPrice * k50 + tkData.ema50 * (1 - k50);

            tkData.last = currentPrice;
            tkData.isAboveVwap = currentPrice > tkData.vwap;
            tkData.isEmaUp = tkData.ema20 > tkData.ema50;

            if (sym === 'BTCUSDT') btcData = tkData;
        }

        evalCorrelations();
    });

    wsConnection.on('close', () => {
        console.log("🔄 WS Connection closed. Reconnecting...");
        setTimeout(startStream, 3000);
    });

    wsConnection.on('error', (err) => {
        console.error("⚠️ WS Socket Error: " + err.message);
    });
}

// The Mathematical Correlation Engine
function evalCorrelations() {
    const btc = DATA.tokens['BTCUSDT'];
    if (!btc) return;

    DATA.btc = btc;
    const synced = [];
    const inverse = [];
    let unaligned = 0;

    const btcTrendStatus = btc.isEmaUp;
    const btcVwapStatus = btc.isAboveVwap;

    // Evaluate 199 other tokens
    for (const sym in DATA.tokens) {
        if (sym === 'BTCUSDT') continue;
        
        const tk = DATA.tokens[sym];
        
        const isMatchedTrend = (tk.isEmaUp === btcTrendStatus);
        const isMatchedVwap = (tk.isAboveVwap === btcVwapStatus);

        const isInverseTrend = (tk.isEmaUp !== btcTrendStatus);
        const isInverseVwap = (tk.isAboveVwap !== btcVwapStatus);

        if (isMatchedTrend && isMatchedVwap) {
            synced.push(tk);
        } else if (isInverseTrend && isInverseVwap) {
            inverse.push(tk);
        } else {
            unaligned++;
        }
    }

    // Calculate dist based on VWAP for the execution engine (matching old bot logic)
    inverse.forEach(tk => {
        tk.dist = ((tk.last - tk.vwap) / tk.vwap) * 100;
    });

    inverse.sort((a,b) => Math.abs(b.dist) - Math.abs(a.dist));
    synced.sort((a,b) => Math.abs((b.last - b.vwap)/b.vwap) - Math.abs((a.last - a.vwap)/a.vwap));

    DATA.synced = synced;
    DATA.inverse = inverse;
    DATA.stats.syncedCount = synced.length;
    DATA.stats.inverseCount = inverse.length;
    DATA.stats.unalignedCount = unaligned;

    executeTrades();
    broadcast();
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

        trade.currentGap = ((currentData.last - currentData.vwap) / currentData.vwap) * 100;
        
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
            
            if (trade.pnl > 0) winCount++;
            else lossCount++;
            
            sessionPnl += trade.pnl;
            tradeHistory.unshift(trade);
            if (tradeHistory.length > 50) tradeHistory.pop();
            
            tradeCooldowns[trade.symbol] = now + 60000;
            activeTrades.splice(i, 1);
            console.log(`✅ [EXIT] ${trade.side} ${trade.symbol} closed at ${trade.pnl.toFixed(2)}% | Reason: ${trade.status}`);
        }
    }

    // 2. Open new trades using Rebellion Strategy (Inverse target filtering)
    while (activeTrades.length < ENGINE_CONFIG.maxTrades) {
        const btcTrendStatus = btc.isEmaUp; 
        
        const candidates = DATA.inverse.filter(t => {
            const isCooldown = tradeCooldowns[t.symbol] && now < tradeCooldowns[t.symbol];
            const isActive = activeTrades.some(a => a.symbol === t.symbol);
            if (isCooldown || isActive) return false;

            // SHORT CRITERIA: BTC is DOWNTREND (False). Inverse token is pumping (> +0.45%)
            if (!btcTrendStatus && t.dist > ENGINE_CONFIG.entryDistance) return true;
            
            // LONG CRITERIA: BTC is UPTREND (True). Inverse token is bleeding (< -0.45%)
            if (btcTrendStatus && t.dist < -ENGINE_CONFIG.entryDistance) return true;

            return false;
        });

        if (candidates.length === 0) break;

        const chosen = candidates[0];
        const side = chosen.dist > 0 ? 'SHORT' : 'LONG';
        
        activeTrades.push({
            symbol: chosen.symbol,
            side: side,
            entryPrice: chosen.last,
            entryGap: chosen.dist,
            currentGap: chosen.dist,
            pnl: 0,
            startTime: now
        });
        
        console.log(`🔥 [ENTRY] Opened ${side} on ${chosen.symbol} precisely at ${chosen.dist.toFixed(2)}% distance.`);
    }
}

// Throttle broadcast slightly if needed, but WebSocket UI can handle 1000ms easy
function broadcast() {
    const payload = {
        btc: DATA.btc,
        synced: DATA.synced.slice(0, 50),
        inverse: DATA.inverse.slice(0, 50),
        stats: DATA.stats,
        activeTrades,
        history: tradeHistory,
        sessionPnl,
        winCount,
        lossCount,
        config: ENGINE_CONFIG
    };
    io.emit('correlation-update', payload);
}

// Run sequence
async function boot() {
    await fetchTopSymbols();
    await bootstrap();
    startStream();
}

server.listen(3009, () => {
    console.log("🚀 BTC Correlation Scanner live on port 3009");
    boot();
});
