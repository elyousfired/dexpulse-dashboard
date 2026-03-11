import axios from 'axios';
import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

async function fetch1mKlines(symbol, startTime, endTime) {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1000`;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        return res.data.map(k => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4])
        }));
    } catch (err) {
        console.error(`Error fetching 1m for ${symbol}:`, err.message);
        return [];
    }
}

async function runSimulation() {
    console.log("🚀 STARTING SCIENTIFIC PURE-BASKET SIMULATION...");

    let hunts = [];
    try {
        const res = await axios.get('http://187.124.33.159:3001/api/hunts');
        hunts = res.data;
    } catch (e) {
        console.error("❌ Failed to fetch hunts from API");
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const trades = hunts.filter(h =>
        h.strategyId === 'golden_rotation' &&
        (h.exitTime && h.exitTime.startsWith(today))
    ).sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    console.log(`📊 Processing ${trades.length} trades in a Timeline...`);

    // 1. Fetch all klines
    const klineCache = {};
    for (const trade of trades) {
        if (klineCache[trade.symbol]) continue;
        const startTs = new Date(trade.entryTime).getTime();
        const endTs = new Date(trade.exitTime).getTime() + (120 * 60 * 1000);
        klineCache[trade.symbol] = await fetch1mKlines(trade.symbol, startTs, endTs);
        process.stdout.write(".");
    }
    console.log("\n✅ Data cached.");

    // 2. Simulation Timeline
    let currentTime = new Date(trades[0].entryTime).getTime();
    const lastExit = new Date(trades[trades.length - 1].exitTime).getTime();

    let activeSims = [];
    let completedSims = [];
    let pendingEntries = [...trades];

    console.log("⏳ Replaying Market...");

    while (currentTime <= lastExit || activeSims.length > 0) {
        // A. Handle ENTRIES
        const toEntry = pendingEntries.filter(t => new Date(t.entryTime).getTime() <= currentTime);
        for (const e of toEntry) {
            activeSims.push({
                ...e,
                simEntryPrice: e.entryPrice,
                simStatus: 'active',
                currentSimPnL: 0
            });
            pendingEntries = pendingEntries.filter(p => p !== e);
        }

        // B. Update PnL
        if (activeSims.length > 0) {
            let totalPnL = 0;
            let bestPnL = -Infinity;

            for (const h of activeSims) {
                // Find kline closest to currentTime
                const k = (klineCache[h.symbol] || []).find(kl => kl.time >= currentTime);
                if (k) {
                    const currentPnL = ((k.close - h.simEntryPrice) / h.simEntryPrice) * 100;
                    h.currentSimPnL = currentPnL;
                    totalPnL += currentPnL;
                    if (currentPnL > bestPnL) bestPnL = currentPnL;
                }
            }

            // C. Apply Basket Logic
            const dynamicTarget = Math.min(bestPnL * 0.8, 8.0);
            const isBasketExit = totalPnL >= dynamicTarget && totalPnL > 0;
            const hasHardStop = activeSims.some(h => h.currentSimPnL <= -5.0);

            if (isBasketExit || hasHardStop) {
                for (const h of activeSims) {
                    h.simStatus = 'closed';
                    h.simExitPnL = h.currentSimPnL;
                    completedSims.push(h);
                }
                activeSims = [];
            }
        }

        // If no active sims and no pending entries, break
        if (activeSims.length === 0 && pendingEntries.length === 0) break;

        currentTime += 60000; // 1 min step
    }

    // Final Report
    const totalRealized = trades.reduce((acc, t) => acc + (parseFloat(t.pnl) || 0), 0);
    const totalSimulated = completedSims.reduce((acc, t) => acc + (t.simExitPnL || 0), 0);

    console.log("\n\n🏆 --- PURE BASKET SIMULATION RESULTS ---");
    console.log(`REALIZED (Mixed Logic): ${totalRealized.toFixed(2)}%`);
    console.log(`SIMULATED (Pure Basket): ${totalSimulated.toFixed(2)}%`);
    console.log(`Trades Processed: ${completedSims.length} / ${trades.length}`);
}

runSimulation();
