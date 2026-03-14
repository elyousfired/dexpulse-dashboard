#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ⚡  ORDER FLOW DELTA SERVICE (Whale Surveillance 4.0)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Main Objectives:
 *    ✅ Real-time Delta: Track AggTrade events via WebSockets.
 *    ✅ Net Pressure: Calculate Buy vs Sell aggression f l-w-aq-t l-7-ali.
 *    ✅ Whale Detection: Flag large market orders (> $10k).
 *    ✅ IPC Sync: Saves live state to server/data/live_order_flow.json
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data', 'live_order_flow.json');
const MARKET_DATA_FILE = path.join(__dirname, 'data', 'institutional_market.json');

const CONFIG = {
    maxSymbols: 10, // Track up to 10 most active symbols via WS
    updateIntervalMs: 2000,
    whaleThresholdUsdt: 10000,
};

let activeSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
let symbolData = {}; // { symbol: { delta: 0, buyVol: 0, sellVol: 0, whaleEvents: [] } }
let ws = null;

function initSymbolData(symbol) {
    if (!symbolData[symbol]) {
        symbolData[symbol] = {
            symbol,
            delta: 0,
            buyVol: 0,
            sellVol: 0,
            whaleEvents: [],
            lastUpdate: Date.now()
        };
    }
}

async function updateActiveSymbols() {
    try {
        if (fs.existsSync(MARKET_DATA_FILE)) {
            const audit = JSON.parse(fs.readFileSync(MARKET_DATA_FILE, 'utf8'));
            if (audit.marketAudit && audit.marketAudit.length > 0) {
                const top = audit.marketAudit.slice(0, CONFIG.maxSymbols).map(m => m.symbol.toLowerCase());
                if (JSON.stringify(top) !== JSON.stringify(activeSymbols.map(s => s.toLowerCase()))) {
                    console.log(`[OrderFlow] 🔄 Updating tracking pool: ${top.join(', ')}`);
                    activeSymbols = top.map(s => s.toUpperCase());
                    connectWebSocket();
                }
            }
        }
    } catch (e) {
        console.error(`[OrderFlow] ❌ Failed to update active symbols: ${e.message}`);
    }
}

function connectWebSocket() {
    if (ws) {
        ws.terminate();
    }

    const streams = activeSymbols.map(s => `${s.toLowerCase()}@aggTrade`).join('/');
    const url = `wss://stream.binance.com:9443/ws/${streams}`;

    console.log(`[OrderFlow] 📡 Connecting to Binance WebSocket: ${url}`);
    ws = new WebSocket(url);

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        handleTrade(msg);
    });

    ws.on('error', (e) => console.error(`[OrderFlow] ❌ WS Error: ${e.message}`));
    ws.on('close', () => {
        console.log('[OrderFlow] 🔌 WS Closed. Reconnecting in 5s...');
        setTimeout(connectWebSocket, 5000);
    });
}

function handleTrade(trade) {
    const symbol = trade.s;
    const price = parseFloat(trade.p);
    const qty = parseFloat(trade.q);
    const value = price * qty;
    const isBuyerMaker = trade.m; // true means sell (taker), false means buy (taker)

    initSymbolData(symbol);
    const entry = symbolData[symbol];

    if (!isBuyerMaker) {
        entry.delta += value;
        entry.buyVol += value;
    } else {
        entry.delta -= value;
        entry.sellVol += value;
    }

    if (value >= CONFIG.whaleThresholdUsdt) {
        entry.whaleEvents.unshift({
            time: Date.now(),
            side: isBuyerMaker ? 'SELL' : 'BUY',
            value: value.toFixed(2),
            price: price.toFixed(price < 1 ? 5 : 2)
        });
        // Keep last 10 whale events
        if (entry.whaleEvents.length > 10) entry.whaleEvents.pop();
    }

    entry.lastUpdate = Date.now();
}

function saveState() {
    try {
        const state = {
            timestamp: Date.now(),
            data: symbolData
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error(`[OrderFlow] ❌ State save failed: ${e.message}`);
    }
}

// Ensure data dir exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initial Run
updateActiveSymbols();
connectWebSocket();

// Maintenance Loops
setInterval(updateActiveSymbols, 60 * 1000); // Check for new top symbols every minute
setInterval(saveState, CONFIG.updateIntervalMs);

console.log(`[OrderFlow] 🛡️ Service Started. Tracking ${activeSymbols.length} symbols...`);
