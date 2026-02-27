
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

async function runStrategyComparison() {
    console.log("--- TRAILING STRATEGY COMPARISON (FEB 25 - FEB 27) ---");
    const symbols = ["DENTUSDT", "MIRAUSDT", "MORPHOUSDT", "JSTUSDT"];
    const startWindow = Date.UTC(2026, 1, 25, 0, 0, 0);

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

    for (const s of symbols) {
        console.log(`\n--- Symbol: ${s} ---`);
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 800)
        ]);
        if (!k1d || !k15m) continue;

        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        let pQ = 0, pB = 0, qW_Base = 0, bW_Base = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) { qW_Base += k.quoteVolume; bW_Base += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        // Find the first v7 entry
        let entryCandle = null;
        let entryIdx = -1;
        let qToday = 0, bToday = 0;
        let lastDayProcessed = -1;

        for (let i = 0; i < k15m.length; i++) {
            const k = k15m[i];
            if (k.time < startWindow) continue;
            const dayTs = new Date(k.time).setUTCHours(0, 0, 0, 0);
            if (dayTs !== lastDayProcessed) { qToday = 0; bToday = 0; lastDayProcessed = dayTs; }
            qToday += k.quoteVolume; bToday += k.volume;
            if (i === 0) continue;

            const cVW = (qW_Base + qToday) / (bW_Base + bToday);
            let wMax = -Infinity;
            k1d.forEach((dk, idx) => { if (getMonTs(dk.time) === monTs && dk.time < dayTs) { if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx]; } });

            if (k.close > prevWeekVwap && k.close > cVW && k.close > wMax && k15m[i - 1].close <= wMax && cVW > prevWeekVwap) {
                entryCandle = k; entryIdx = i; break;
            }
        }

        if (!entryCandle) { console.log("No v7 entry found."); continue; }
        const entryPrice = entryCandle.close;
        console.log(`v7 Entry at ${new Date(entryCandle.time).toISOString().slice(0, 16)}: ${entryPrice}`);

        // 1. Standard Trailing (2%)
        let peak1 = entryPrice;
        let exit1 = null;
        for (let j = entryIdx + 1; j < k15m.length; j++) {
            if (k15m[j].high > peak1) peak1 = k15m[j].high;
            if ((peak1 - entryPrice) / entryPrice >= 0.03) {
                if (k15m[j].low <= peak1 * 0.98) { exit1 = peak1 * 0.98; break; }
            }
            if (k15m[j].low <= entryPrice * 0.95) { exit1 = entryPrice * 0.95; break; } // SL
        }
        exit1 = exit1 || k15m[k15m.length - 1].close;
        console.log(`Standard (2%): PnL ${(((exit1 - entryPrice) / entryPrice) * 100).toFixed(2)}% | Peak: ${(((peak1 - entryPrice) / entryPrice) * 100).toFixed(2)}%`);

        // 2. Tiered Trailing
        let peak2 = entryPrice;
        let exit2 = null;
        for (let j = entryIdx + 1; j < k15m.length; j++) {
            if (k15m[j].high > peak2) peak2 = k15m[j].high;
            const profitAtPeak = (peak2 - entryPrice) / entryPrice;

            let trailDist = 0.02; // Default
            if (profitAtPeak >= 0.50) trailDist = 0.15;
            else if (profitAtPeak >= 0.20) trailDist = 0.08;
            else if (profitAtPeak >= 0.10) trailDist = 0.05;
            else if (profitAtPeak >= 0.03) trailDist = 0.02;

            if (profitAtPeak >= 0.03) {
                if (k15m[j].low <= peak2 * (1 - trailDist)) { exit2 = peak2 * (1 - trailDist); break; }
            }
            if (k15m[j].low <= entryPrice * 0.95) { exit2 = entryPrice * 0.95; break; } // SL
        }
        exit2 = exit2 || k15m[k15m.length - 1].close;
        console.log(`Tiered Trailing: PnL ${(((exit2 - entryPrice) / entryPrice) * 100).toFixed(2)}%`);
    }
}

runStrategyComparison();
