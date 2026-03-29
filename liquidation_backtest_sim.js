#!/usr/bin/env node

/**
 * 🧪 NUCLEAR PULSE SIMULATOR (TOP 100 SYMBOLS - NO LEVERAGE)
 * 📊 Logic: Sniping Extreme 1m Price Deviations (Liquidation Wicks)
 * 🔬 Test Period: Last 24 Hours | 1x Leverage
 */

import axios from 'axios';

const CONFIG = {
    interval: '1m',
    limit: 1440, 
    spikeThreshold: 0.6, 
    tp: 0.4,
    sl: 0.2,
    leverage: 1 // 1x Leverage, Raw Sport-like Performance
};

async function fetchTopSymbols(n = 100) {
    try {
        const res = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
        return res.data
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a,b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, n)
            .map(t => t.symbol);
    } catch (e) { return ['SOLUSDT', 'BTCUSDT', 'ETHUSDT']; }
}

async function fetchKlines(symbol) {
    try {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${CONFIG.interval}&limit=${CONFIG.limit}`;
        const res = await axios.get(url);
        return res.data.map(d => ({
            o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
        }));
    } catch (e) { return []; }
}

async function runSimulation() {
    console.log('\n--- FETCHING DATA FOR TOP 100 LIQUIDATION PAIRS ---\n');
    const symbols = await fetchTopSymbols(100);
    
    let totalPnL = 0, totalTrades = 0, wins = 0;

    for (let index = 0; index < symbols.length; index++) {
        const symbol = symbols[index];
        process.stdout.write(`[${index+1}/100] ${symbol} `);
        const klines = await fetchKlines(symbol);
        if (klines.length < CONFIG.limit) { console.log(' (Skip)'); continue; }

        let symbolPnL = 0, symbolTrades = 0;

        for (let i = 1; i < klines.length; i++) {
            const move = ((klines[i].c - klines[i-1].c) / klines[i-1].c) * 100;

            if (Math.abs(move) >= CONFIG.spikeThreshold) {
                const direction = move < 0 ? 'LONG' : 'SHORT';
                let entryPrice = klines[i].c, tradeDone = false;
                
                // Track next 15 bars for exit
                for (let j = i + 1; j < Math.min(i + 15, klines.length); j++) {
                    const low = klines[j].l, high = klines[j].h;

                    if (direction === 'LONG') {
                        if (high >= entryPrice * (1 + CONFIG.tp/100)) { symbolPnL += CONFIG.tp * CONFIG.leverage; wins++; tradeDone = true; break; }
                        if (low <= entryPrice * (1 - CONFIG.sl/100)) { symbolPnL -= CONFIG.sl * CONFIG.leverage; tradeDone = true; break; }
                    } else {
                        if (low <= entryPrice * (1 - CONFIG.tp/100)) { symbolPnL += CONFIG.tp * CONFIG.leverage; wins++; tradeDone = true; break; }
                        if (high >= entryPrice * (1 + CONFIG.sl/100)) { symbolPnL -= CONFIG.sl * CONFIG.leverage; tradeDone = true; break; }
                    }
                }
                if (tradeDone) { symbolTrades++; totalTrades++; i += 10; }
            }
        }
        console.log(`| PnL: ${symbolPnL.toFixed(2)}% | Tr: ${symbolTrades}`);
        totalPnL += symbolPnL;
    }

    console.log('\n\n--- NUCLEAR PULSER (1x LEVERAGE - TOP 100) ---');
    console.log(`Total 24h RAW Fast Trades: ${totalTrades}`);
    console.log(`Aggregate RAW PnL: +${totalPnL.toFixed(2)}%`);
    console.log(`Win Rate: ${((wins/totalTrades)*100).toFixed(1)}%`);
    console.log('----------------------------------------------\n');
}

runSimulation();
