
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return null; }
}

async function runWeeklyCompoundingSimulation() {
    console.log("--- WEEKLY COMPOUNDING SIMULATION: TIERED TRAILING ($10/TOKEN) ---");
    const symbolsRaw = ["om", "virtual", "wld", "gun", "ksm", "pendle", "bard", "fogo", "jst", "dent", "kite", "wbeth", "sky", "uni", "lunc", "zbt", "mira", "morpho", "dot"];
    const symbols = [...new Set(symbolsRaw.map(s => s.toUpperCase() + "USDT"))];

    const startWindow = Date.UTC(2026, 1, 25, 0, 0, 0);
    const endWindow = Date.now();

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const monTs = getMonTs(Date.UTC(2026, 1, 26, 0, 0, 0));
    const prevMonTs = monTs - (7 * 24 * 3600);

    // Initial State
    // User wants $10 in each. We'll start with 20 slots of $10 each.
    // When a slot closes, the balance (10 + profit) is ready for the next available signal.
    const numSlots = 20;
    const initialPerSlot = 10;
    let slotWallets = Array(numSlots).fill(initialPerSlot);
    let activeTrades = []; // { symbol, entry, peak, walletIdx, startTime }
    let tradeHistory = [];

    const coinDataMap = new Map();
    console.log(`Pre-caching data for ${symbols.length} tokens...`);
    for (const s of symbols) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 1000)
        ]);
        if (!k1d || k1d.length < 20 || !k15m) continue;

        let pQ = 0, pB = 0, qW_Base = 0, bW_Base = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) { qW_Base += k.quoteVolume; bW_Base += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        coinDataMap.set(s, { k1d, k15m, prevWeekVwap, qW_Base, bW_Base, dailyVwaps });
    }

    const intervals = [];
    for (let t = startWindow; t <= endWindow; t += 15 * 60 * 1000) intervals.push(t);

    console.log(`Simulating ${intervals.length} intervals with TIERED TRAILING...`);

    for (const time of intervals) {
        const timeStr = new Date(time).toISOString().slice(0, 16).replace('T', ' ');
        const dayStart = new Date(time).setUTCHours(0, 0, 0, 0);

        // 1. Manage Active Trades (Tiered Trailing)
        activeTrades = activeTrades.filter(t => {
            const data = coinDataMap.get(t.symbol);
            const k = data.k15m.find(c => c.time === time);
            if (!k) return true;

            if (k.high > t.peak) t.peak = k.high;

            const profitPct = (t.peak - t.entry) / t.entry;

            // TIERED LOGIC
            let trailDist = 0.02;
            if (profitPct >= 0.30) trailDist = 0.10; // Relax to 10%
            else if (profitPct >= 0.10) trailDist = 0.05; // Relax to 5%

            const exitPrice = t.peak * (1 - trailDist);
            const slPrice = t.entry * 0.95;

            // Stop Loss
            if (k.low <= slPrice) {
                const finalPnl = -5;
                const finalVal = slotWallets[t.walletIdx] * 0.95;
                slotWallets[t.walletIdx] = finalVal;
                tradeHistory.push({ ...t, exit: slPrice, pnl: finalPnl, endTime: timeStr, reason: 'SL', finalVal });
                return false;
            }

            // Trailing Exit (Activation at 3% profit)
            if (profitPct >= 0.03 && k.low <= exitPrice) {
                const actualExit = exitPrice;
                const finalPnl = ((actualExit - t.entry) / t.entry) * 100;
                const finalVal = slotWallets[t.walletIdx] * (1 + finalPnl / 100);
                slotWallets[t.walletIdx] = finalVal;
                tradeHistory.push({ ...t, exit: actualExit, pnl: finalPnl, endTime: timeStr, reason: 'Trailing', finalVal });
                return false;
            }
            return true;
        });

        // 2. Entries (Reinvest current wallet balance)
        for (const [symbol, data] of coinDataMap) {
            if (activeTrades.find(at => at.symbol === symbol)) continue;
            // Limit 1 entry per token per day to simulate bot behavior
            if (tradeHistory.find(h => h.symbol === symbol && new Date(h.timeEntry).setUTCHours(0, 0, 0, 0) === dayStart)) continue;

            // Find free wallet
            const freeWalletIdx = slotWallets.findIndex((_, idx) => !activeTrades.find(at => at.walletIdx === idx));
            if (freeWalletIdx === -1) break;

            const kIdx = data.k15m.findIndex(c => c.time === time);
            if (kIdx <= 1) continue;
            const k = data.k15m[kIdx];
            const prevK = data.k15m[kIdx - 1];

            // Re-calc structural max for today
            let wMax = -Infinity, wMin = Infinity;
            data.k1d.forEach((dk, idx) => {
                if (getMonTs(dk.time) === monTs && dk.time < dayStart) {
                    if (data.dailyVwaps[idx] > wMax) wMax = data.dailyVwaps[idx];
                    if (data.dailyVwaps[idx] < wMin) wMin = data.dailyVwaps[idx];
                }
            });
            if (wMax === -Infinity) continue;

            // Running week VWAP
            let qT = 0, bT = 0;
            for (let j = 0; j <= kIdx; j++) {
                if (data.k15m[j].time >= dayStart) { qT += data.k15m[j].quoteVolume; bT += data.k15m[j].volume; }
            }
            const cVW = (data.qW_Base + qT) / (data.bW_Base + bT);
            const volatility = Math.abs(wMax - wMin) / k.close;

            // v7 Entry
            if (k.close > data.prevWeekVwap && k.close > cVW && k.close > wMax && prevK.close <= wMax && cVW > data.prevWeekVwap && volatility > 0.02) {
                activeTrades.push({
                    symbol,
                    walletIdx: freeWalletIdx,
                    entry: k.close,
                    peak: k.close,
                    timeEntry: timeStr,
                    initialCapital: slotWallets[freeWalletIdx]
                });
            }
        }
    }

    // Final Report
    console.log("\n--- AUDIT HISTORY (TIERED + COMPOUNDING) ---");
    tradeHistory.forEach(h => {
        console.log(`[${h.timeEntry.slice(5, 10)}] ${h.symbol.padEnd(8)} | Wallet: $${h.initialCapital.toFixed(2)} -> $${h.finalVal.toFixed(2)} | PnL: ${h.pnl.toFixed(2)}% | Reason: ${h.reason}`);
    });

    const finalBalance = slotWallets.reduce((a, b) => a + b, 0);
    const profit = finalBalance - (numSlots * initialPerSlot);
    console.log(`\n================================`);
    console.log(`INITIAL CAPITAL : $${(numSlots * initialPerSlot).toFixed(2)}`);
    console.log(`FINAL BALANCE  : $${finalBalance.toFixed(2)}`);
    console.log(`PROFIT          : $${profit.toFixed(2)} (${((profit / (numSlots * initialPerSlot)) * 100).toFixed(2)}%)`);
    console.log(`================================`);
}

runWeeklyCompoundingSimulation();
