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

const PORT = 3008;

// --- State ---
let symbols = [];
let tokenData = {}; // { symbol: { last, ema20, dist, signal } }
let activeTrades = []; // { symbol, side, entryPrice, entryGap, currentGap, pnl, startTime }
let tradeHistory = [];
let tradeCooldowns = {}; // { symbol: timestamp }
let sessionPnl = 0; // Tracks total PnL since server start
let lastUpdate = Date.now();

// --- Analytics State ---
let winCount = 0;
let lossCount = 0;
let tokenStats = {}; // { symbol: { netPnl: 0, wins: 0, losses: 0 } }
let pnlHistory = [{ time: new Date().toLocaleTimeString(), pnl: 0 }];

let ENGINE_CONFIG = {
    entryDistance: 0.45,
    takeProfit: 1.50,
    stopLoss: -2.00,
    maxHoldSeconds: 300,
    maxTrades: 5,
    leverage: 10
};

io.on('connection', (socket) => {
    socket.on('update-config', (newConfig) => {
        ENGINE_CONFIG = { ...ENGINE_CONFIG, ...newConfig };
        console.log("⚙️ Engine Config Updated:", ENGINE_CONFIG);
        broadcast();
    });
});

// --- Utils: Fetch Top 200 Symbols by Volume ---
async function fetchTopSymbols() {
    try {
        const res = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
        symbols = res.data
            .filter(t => t.symbol.endsWith('USDT'))
            .filter(t => !t.symbol.includes('XAG') && !t.symbol.includes('XAU') && !t.symbol.includes('INDEX'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 200)
            .map(t => t.symbol);
        
        console.log(`📡 Monitoring Top ${symbols.length} Markets...`);
    } catch (e) {
        console.error('❌ Symbol Fetch Error:', e.message);
    }
}

// Helper to chunk promises and sleep
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- Utils: Bootstrap Data (EMA 9) ---
async function bootstrap() {
    console.log(`⏳ Bootstrapping EMA 20 for ${symbols.length} symbols. This takes a few seconds to avoid API bans...`);

    const chunkSize = 20; // 20 requests at a time
    for (let i = 0; i < symbols.length; i += chunkSize) {
        const chunk = symbols.slice(i, i + chunkSize);
        
        const tasks = chunk.map(async (symbol) => {
            try {
                // Fetch 1000 1m klines for dual EMAs
                const res = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1000`, { timeout: 10000 });
                if (!res.data || res.data.length < 100) return;

                const prices = res.data.map(k => parseFloat(k[4]));
                const ema20Values = EMA.calculate({ period: 20, values: prices });
                const ema20 = ema20Values[ema20Values.length - 1];
                
                // Calculate Local Trend Shield (EMA 50)
                let ema50;
                if (prices.length >= 50) {
                    const ema50Values = EMA.calculate({ period: 50, values: prices });
                    ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : prices[prices.length - 1];
                } else {
                    ema50 = prices.reduce((a,b) => a+b, 0) / prices.length;
                }

                const last = prices[prices.length - 1];
                const dist = ((last - ema20) / ema20) * 100;

                tokenData[symbol] = {
                    last,
                    ema20,
                    ema50,
                    dist,
                    signal: getSignal(dist)
                };
            } catch (e) {
                console.error(`❌ Bootstrap ${symbol} Error:`, e.message);
            }
        });

        await Promise.all(tasks);
        await delay(500); // 500ms sleep between chunks to respect Binance limits
    }

    console.log(`✅ Bootstrapping complete for all symbols.`);
}

function getSignal(dist) {
    if (dist > 2.0) return "EXTREME OVERBOUGHT (SHORT)";
    if (dist < -2.0) return "EXTREME OVERSOLD (LONG)";
    if (dist > 1.0) return "OVEREXTENDED UP";
    if (dist < -1.0) return "OVEREXTENDED DOWN";
    return "NEUTRAL";
}

// --- Real-time Stream: !ticker@arr ---
// Using the global all-market ticker stream is much more efficient than 200 individual streams
let binanceWs;
function startStream() {
    if (binanceWs) binanceWs.terminate();

    const url = `wss://fstream.binance.com/stream?streams=!ticker@arr`;
    
    try {
        binanceWs = new WebSocket(url);

        binanceWs.on('message', (msgStr) => {
            try {
                const raw = JSON.parse(msgStr);
                if (!raw.data || !Array.isArray(raw.data)) return;

                const tickers = raw.data;
                let updated = false;

                for (const data of tickers) {
                    const s = data.s;
                    if (!symbols.includes(s) || !tokenData[s]) continue;

                    const price = parseFloat(data.c);
                    const td = tokenData[s];
                    
                    // Recalculate EMA 20
                    const k20 = 2 / (20 + 1);
                    td.ema20 = price * k20 + td.ema20 * (1 - k20);

                    // Recalculate EMA 50 (Localized Shield)
                    const k50 = 2 / (50 + 1);
                    td.ema50 = price * k50 + td.ema50 * (1 - k50);
                    
                    td.last = price;
                    td.dist = ((price - td.ema20) / td.ema20) * 100;
                    td.signal = getSignal(td.dist);
                    updated = true;
                }

                if (updated) {
                    lastUpdate = Date.now();
                    broadcast();
                }
            } catch (e) {
                console.error('⚠️ Stream Parsng Error:', e.message);
            }
        });

        binanceWs.on('error', (err) => {
            console.error('⚠️ WS Socket Error:', err.message);
        });

        binanceWs.on('close', () => {
            console.log('🔄 WS Connection closed. Reconnecting...');
            setTimeout(startStream, 5000);
        });

    } catch (e) {
        console.error('⚠️ WS Init Error (Network Dropped?):', e.message);
        setTimeout(startStream, 5000);
    }
}

// Broadcast limited to every 1000ms max to save frontend UI lag
let lastBroadcast = 0;
function broadcast() {
    const now = Date.now();
    if (now - lastBroadcast < 1000) return; // Cap at 1 FPS
    lastBroadcast = now;

    // 1. Sort market data
    const sortedMarket = Object.keys(tokenData).map(s => ({
        symbol: s,
        ...tokenData[s]
    })).sort((a,b) => b.dist - a.dist);

    // 2. Identify Pools based on Config threshold + Local Trend Filter (EMA 50)
    // SHORT rule: Pumping (+ Dist), Local Trend DOWN
    const topShorts = sortedMarket.filter(t => t.dist > ENGINE_CONFIG.entryDistance && t.ema20 < t.ema50).slice(0, 3);
    
    // LONG rule: Dumping (- Dist), Local Trend UP
    const topLongs = sortedMarket.filter(t => t.dist < -ENGINE_CONFIG.entryDistance && t.ema20 > t.ema50).slice(-3).reverse();

    // 3. Evaluate Active Trades (PnL, Stop-Loss, Take-Profit)
    for (let i = activeTrades.length - 1; i >= 0; i--) {
        const trade = activeTrades[i];
        const currentData = tokenData[trade.symbol];
        
        trade.currentGap = currentData.dist;
        
        // PnL Math
        if (trade.side === 'SHORT') {
            trade.pnl = (trade.entryPrice / currentData.last - 1) * 100;
        } else {
            trade.pnl = (currentData.last / trade.entryPrice - 1) * 100;
        }

        // Liquidation Math (Approx 100 / leverage)
        const liqDistance = 100 / ENGINE_CONFIG.leverage;
        trade.liqPrice = trade.side === 'LONG' 
            ? trade.entryPrice * (1 - (liqDistance / 100))
            : trade.entryPrice * (1 + (liqDistance / 100));

        // Exit Conditions
        const isTP = trade.pnl >= ENGINE_CONFIG.takeProfit;
        const isSL = trade.pnl <= ENGINE_CONFIG.stopLoss;
        const holdSeconds = (now - trade.startTime) / 1000;
        const isTimeBailout = holdSeconds >= ENGINE_CONFIG.maxHoldSeconds && trade.pnl < 0;

        if (isTP || isSL || isTimeBailout) {
            trade.endTime = now;
            
            if (isTimeBailout) {
                trade.status = `TIME_BAILOUT_${Math.floor(holdSeconds)}s`;
            } else if (isSL) {
                trade.status = 'STOP_LOSS';
            } else {
                trade.status = `TAKE_PROFIT_${ENGINE_CONFIG.takeProfit}%`;
            }

            trade.exitPrice = currentData.last;
            trade.exitGap = currentData.dist;

            // Analytics Updates
            if (trade.pnl > 0) {
                winCount++;
                if (!tokenStats[trade.symbol]) tokenStats[trade.symbol] = { netPnl: 0, wins: 0, losses: 0 };
                tokenStats[trade.symbol].wins++;
            } else {
                lossCount++;
                if (!tokenStats[trade.symbol]) tokenStats[trade.symbol] = { netPnl: 0, wins: 0, losses: 0 };
                tokenStats[trade.symbol].losses++;
            }
            tokenStats[trade.symbol].netPnl += trade.pnl;

            tradeHistory.unshift(trade);
            if (tradeHistory.length > 50) tradeHistory.pop(); // Keep more history for UI
            
            // Add to session total and push to chart history
            sessionPnl += trade.pnl;
            pnlHistory.push({ time: new Date().toLocaleTimeString(), pnl: sessionPnl });
            if (pnlHistory.length > 100) pnlHistory.shift();

            tradeCooldowns[trade.symbol] = now + 60000; // 60s cooldown
            console.log(`✅ [EXIT] ${trade.side} ${trade.symbol} closed at ${trade.pnl.toFixed(2)}% | Reason: ${trade.status}`);
            
            activeTrades.splice(i, 1);
        }
    }

    // 4. Enter New Trades (Strict Lock based on config)
    while (activeTrades.length < ENGINE_CONFIG.maxTrades) {
        // Build a pool of all valid candidates (from the top 3s), excluding active/cooldowns
        const candidates = [...topShorts, ...topLongs].filter(t => {
            const isCooldown = tradeCooldowns[t.symbol] && now < tradeCooldowns[t.symbol];
            const isActive = activeTrades.some(a => a.symbol === t.symbol);
            return !isCooldown && !isActive;
        });

        if (candidates.length === 0) break; // No valid candidates

        // Pick the one with the most extreme absolute distance
        candidates.sort((a,b) => Math.abs(b.dist) - Math.abs(a.dist));
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

    // 5. Broadcast to Dashboard
    
    // Compute Leaderboards
    const tokensArray = Object.keys(tokenStats).map(s => ({ symbol: s, ...tokenStats[s] }));
    tokensArray.sort((a,b) => b.netPnl - a.netPnl);
    const bestToken = tokensArray.length > 0 ? tokensArray[0] : null;
    const worstToken = tokensArray.length > 0 ? tokensArray[tokensArray.length-1] : null;

    // BTC Macro Trend Evaluation
    const btcData = tokenData['BTCUSDT'];
    const btcMacro = btcData ? {
        trend: btcData.ema20 > btcData.ema50 ? 'UP' : 'DOWN',
        ema20: btcData.ema20,
        ema50: btcData.ema50
    } : null;

    io.emit('engine-update', {
        activeTrades,
        topShorts,
        topLongs,
        history: tradeHistory,
        sessionPnl,
        config: ENGINE_CONFIG,
        analytics: {
            winCount,
            lossCount,
            pnlHistory,
            bestToken,
            worstToken,
            btcMacro
        }
    });
}

// --- Bootstrap ---
async function boot() {
    await fetchTopSymbols();
    await bootstrap();
    startStream();
    server.listen(PORT, () => console.log(`🚀 Top 200 Reversion Scanner live on port ${PORT}`));
}

boot();
