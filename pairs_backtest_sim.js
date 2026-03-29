#!/usr/bin/env node

/**
 * 🧪 PAIRS STRATEGY BACKTESTER (REAL DATA)
 * 📊 Logic: Spread Mean Reversion (Z-Score)
 * 🔬 Test Period: Last 7 Days
 */

import axios from 'axios';

const CONFIG = {
    testPairs: [
        { a: 'SOLUSDT', b: 'JUPUSDT', name: 'Solana Ecosystem' },
        { a: 'ETHUSDT', b: 'ETCUSDT', name: 'The Classic Pair' },
        { a: 'FETUSDT', b: 'AGIXUSDT', name: 'AI Sector' },
        { a: 'DOGEUSDT', b: '1000SHIBUSDT', name: 'Meme Sector' },
        { a: 'BTCUSDT', b: 'LTCUSDT', name: 'Legacy Pair' }
    ],
    interval: '1h',
    limit: 168, // 1 week in hours
    zEntry: 2.0,
    zExit: 0.2,
    capital: 1000, // Simulated $1k
    leverage: 1 // Simulation at 1x for pure data
};

async function fetchKlines(symbol) {
    console.log(`[Data] Fetching ${symbol}...`);
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${CONFIG.interval}&limit=${CONFIG.limit}`;
    const res = await axios.get(url);
    return res.data.map(d => parseFloat(d[4])); // Closings
}

function calculateZScore(current, history) {
    const n = history.length;
    const mean = history.reduce((a, b) => a + b) / n;
    const std = Math.sqrt(history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n);
    return std === 0 ? 0 : (current - mean) / std;
}

async function runSimulation() {
    console.log('\n--- PAIRS BACKTEST: 7-DAY REAL DATA SCAN ---\n');
    
    let totalPnL = 0;
    let totalTrades = 0;
    let wins = 0;

    for (const pair of CONFIG.testPairs) {
        const pricesA = await fetchKlines(pair.a);
        const pricesB = await fetchKlines(pair.b);
        
        if (pricesA.length < CONFIG.limit || pricesB.length < CONFIG.limit) continue;

        let inPosition = false;
        let entryRatio = 0;
        let entryPriceA = 0;
        let entryPriceB = 0;
        let entryDirectionA = '';
        let pairPnL = 0;
        let pairTrades = 0;

        // Start from index 24 (need history for Z-Score)
        for (let i = 24; i < pricesA.length; i++) {
            const ratiosHistory = [];
            for (let j = i - 24; j < i; j++) {
                ratiosHistory.push(pricesA[j] / pricesB[j]);
            }

            const currentRatio = pricesA[i] / pricesB[i];
            const liveA = pricesA[i];
            const liveB = pricesB[i];
            const z = calculateZScore(currentRatio, ratiosHistory);

            if (!inPosition) {
                if (Math.abs(z) >= CONFIG.zEntry) {
                    inPosition = true;
                    entryRatio = currentRatio;
                    entryPriceA = liveA;
                    entryPriceB = liveB;
                    entryDirectionA = z > 0 ? 'SHORT' : 'LONG';
                    pairTrades++;
                    totalTrades++;
                }
            } else {
                // Exit when Z-Score reverts to zero
                if (Math.abs(z) <= CONFIG.zExit) {
                    const pnlA = entryDirectionA === 'LONG' ? (liveA - entryPriceA)/entryPriceA : (entryPriceA - liveA)/entryPriceA;
                    const directionB = entryDirectionA === 'LONG' ? 'SHORT' : 'LONG';
                    const pnlB = directionB === 'LONG' ? (liveB - entryPriceB)/entryPriceB : (entryPriceB - liveB)/entryPriceB;
                    
                    const tradePnL = (pnlA + pnlB) * 100; // Unleveraged %
                    pairPnL += tradePnL;
                    if (tradePnL > 0) { wins++; }
                    inPosition = false;
                }
            }
        }

        console.log(`[RESULT] ${pair.name} (${pair.a}/${pair.b}): PnL: ${pairPnL.toFixed(2)}% | Trades: ${pairTrades}`);
        totalPnL += pairPnL;
    }

    console.log('\n--- FINAL SUMMARY ---');
    console.log(`Total Scanned Units: ${CONFIG.testPairs.length}`);
    console.log(`Total Executed Trades: ${totalTrades}`);
    console.log(`Aggregate 7-Day PnL: ${totalPnL.toFixed(2)}%`);
    console.log(`Win Rate: ${((wins/totalTrades)*100).toFixed(0)}%`);
    console.log('----------------------\n');
}

runSimulation();
