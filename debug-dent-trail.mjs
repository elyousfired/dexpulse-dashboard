
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

async function debugDentTrail() {
    console.log("--- DENT TRAILING OPTIMIZATION ---");
    const s = "DENTUSDT";
    const k15m = await fetchBinanceKlines(s, '15m', 800);
    const k1d = await fetchBinanceKlines(s, '1d', 40);

    // Hardcoded entry based on previous successful audit (Feb 26 05:00 UTC)
    const entryPrice = 0.0001099; // Approximated from prev audit
    const entryIdx = k15m.findIndex(k => new Date(k.time).toISOString().includes("2026-02-26T05:00"));

    if (entryIdx === -1) { console.log("Entry not found."); return; }

    console.log(`Analyzing from entry ${entryPrice} at index ${entryIdx}`);

    function simulate(trailConfig) {
        let peak = entryPrice;
        let exit = null;
        let exitTime = "";
        for (let j = entryIdx + 1; j < k15m.length; j++) {
            const k = k15m[j];
            if (k.high > peak) peak = k.high;
            const profit = (peak - entryPrice) / entryPrice;

            let trailDist = trailConfig(profit);
            if (profit >= 0.03) {
                if (k.low <= peak * (1 - trailDist)) {
                    exit = peak * (1 - trailDist);
                    exitTime = new Date(k.time).toISOString();
                    break;
                }
            }
            if (k.low <= entryPrice * 0.95) { exit = entryPrice * 0.95; exitTime = "SL"; break; }
        }
        exit = exit || k15m[k15m.length - 1].close;
        return { pnl: ((exit - entryPrice) / entryPrice) * 100, peak: ((peak - entryPrice) / entryPrice) * 100, exitTime };
    }

    const res1 = simulate(p => 0.02); // Fixed 2%
    console.log(`Standard (2%): PnL ${res1.pnl.toFixed(2)}% | Exit at ${res1.exitTime}`);

    const res2 = simulate(p => {
        if (p >= 0.30) return 0.15;
        if (p >= 0.15) return 0.10;
        if (p >= 0.05) return 0.05;
        return 0.02;
    });
    console.log(`Relaxed (Tiered): PnL ${res2.pnl.toFixed(2)}% | Exit at ${res2.exitTime}`);
}

debugDentTrail();
