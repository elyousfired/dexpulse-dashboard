
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

async function runWeeklyCompoundingSimulationDebug() {
    const symbolsRaw = ["om", "virtual", "wld", "gun", "ksm", "pendle", "bard", "fogo", "jst", "dent", "kite", "wbeth", "sky", "uni", "lunc", "zbt", "mira", "morpho", "dot"];
    const symbols = [...new Set(symbolsRaw.map(s => s.toUpperCase() + "USDT"))];

    const startWindow = Date.UTC(2026, 1, 23, 0, 0, 0); // Expand window to ensure structural data is ready
    const simStart = Date.UTC(2026, 1, 25, 0, 0, 0);

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

    const numSlots = 20;
    let slotWallets = Array(numSlots).fill(10);
    let activeTrades = [];
    let tradeHistory = [];

    const coinDataMap = new Map();
    for (const s of symbols) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 1500)
        ]);
        if (!k1d || k1d.length < 20 || !k15m) continue;

        let pQ = 0, pB = 0, qW_Base = 0, bW_Base = 0;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) { qW_Base += k.quoteVolume; bW_Base += k.volume; }
        });
        coinDataMap.set(s, { k1d, k15m, prevWeekVwap: (pB > 0 ? pQ / pB : 0), qW_Base, bW_Base, dailyVwaps });
    }

    const intervals = [];
    for (let t = simStart; t <= Date.now(); t += 15 * 60 * 1000) intervals.push(t);

    for (const time of intervals) {
        const dayStart = new Date(time).setUTCHours(0, 0, 0, 0);
        const timeISO = new Date(time).toISOString();

        activeTrades = activeTrades.filter(t => {
            const data = coinDataMap.get(t.symbol);
            const k = data.k15m.find(c => c.time === time);
            if (!k) return true;
            if (k.high > t.peak) t.peak = k.high;

            const profitPct = (t.peak - t.entry) / t.entry;
            let trailDist = 0.02;
            if (profitPct >= 0.30) trailDist = 0.10;
            else if (profitPct >= 0.10) trailDist = 0.05;

            const exitPrice = t.peak * (1 - trailDist);
            const slPrice = t.entry * 0.95;

            if (k.low <= slPrice) {
                const finalVal = slotWallets[t.walletIdx] * 0.95;
                slotWallets[t.walletIdx] = finalVal;
                tradeHistory.push({ ...t, exit: slPrice, pnl: -5, endTime: timeISO, reason: 'SL', finalVal });
                return false;
            }
            if (profitPct >= 0.03 && k.low <= exitPrice) {
                const finalPnl = ((exitPrice - t.entry) / t.entry) * 100;
                const finalVal = slotWallets[t.walletIdx] * (1 + finalPnl / 100);
                slotWallets[t.walletIdx] = finalVal;
                tradeHistory.push({ ...t, exit: exitPrice, pnl: finalPnl, endTime: timeISO, reason: 'Trailing', finalVal });
                return false;
            }
            return true;
        });

        for (const [symbol, data] of coinDataMap) {
            if (activeTrades.find(at => at.symbol === symbol)) continue;
            if (tradeHistory.find(h => h.symbol === symbol && new Date(h.timeEntry).setUTCHours(0, 0, 0, 0) === dayStart)) continue;

            const freeWalletIdx = slotWallets.findIndex((_, idx) => !activeTrades.find(at => at.walletIdx === idx));
            if (freeWalletIdx === -1) break;

            const kIdx = data.k15m.findIndex(c => c.time === time);
            if (kIdx <= 1) continue;
            const k = data.k15m[kIdx];
            const prevK = data.k15m[kIdx - 1];

            let wMax = -Infinity;
            data.k1d.forEach((dk, idx) => {
                const dkm = getMonTs(dk.time);
                if (dkm === monTs && dk.time < dayStart) {
                    if (data.dailyVwaps[idx] > wMax) wMax = data.dailyVwaps[idx];
                }
            });

            if (wMax === -Infinity) continue;

            let qT = 0, bT = 0;
            for (let j = 0; j <= kIdx; j++) { if (data.k15m[j].time >= dayStart) { qT += data.k15m[j].quoteVolume; bT += data.k15m[j].volume; } }
            const cVW = (data.qW_Base + qT) / (data.bW_Base + bT);

            const isV7 = k.close > data.prevWeekVwap && k.close > cVW && k.close > wMax && prevK.close <= wMax && cVW > data.prevWeekVwap;

            if (isV7) {
                activeTrades.push({
                    symbol, walletIdx: freeWalletIdx, entry: k.close, peak: k.close, timeEntry: timeISO, initialCapital: slotWallets[freeWalletIdx]
                });
            }
        }
    }

    console.log("\n--- AUDIT HISTORY ---");
    tradeHistory.sort((a, b) => a.timeEntry.localeCompare(b.timeEntry)).forEach(h => {
        console.log(`[${h.timeEntry.slice(5, 10)}] ${h.symbol.padEnd(8)} | $${h.initialCapital.toFixed(2)} -> $${h.finalVal.toFixed(2)} | PnL: ${h.pnl.toFixed(2)}% | Reason: ${h.reason}`);
    });

    const finalBalance = slotWallets.reduce((a, b) => a + b, 0);
    console.log(`\nINITIAL: $200.00 | FINAL: $${finalBalance.toFixed(2)} | PROFIT: $${(finalBalance - 200).toFixed(2)}`);
}
runWeeklyCompoundingSimulationDebug();
