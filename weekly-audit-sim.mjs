
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

async function runWeeklyAudit() {
    console.log("--- WEEKLY PERFORMANCE AUDIT (FEB 25 - FEB 27) ---");
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

    const monTs = getMonTs(Date.UTC(2026, 1, 26, 0, 0, 0)); // This week's Monday
    const prevMonTs = monTs - (7 * 24 * 3600);

    const budget = 1000;
    const slots = 10;
    const slotSize = budget / slots;
    let freeSlots = slots;
    let activeTrades = [];
    let history = [];

    // Pre-cache data for all relevant coins
    const coinDataMap = new Map();
    console.log(`Checking ${symbols.length} symbols on Binance...`);
    for (const s of symbols) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 800) // 3 days of 15m is ~300 candles
        ]);
        if (!k1d || k1d.length < 20 || !k15m) continue;

        // Structural data
        let pQ = 0, pB = 0, qWeek = 0, bWeek = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) {
                pQ += k.quoteVolume; pB += k.volume;
            } else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                qWeek += k.quoteVolume; bWeek += k.volume;
            }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        // 1d daily vwap list for max/min calculation
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        coinDataMap.set(s, { k1d, k15m, prevWeekVwap, qWeek, bWeek, dailyVwaps });
    }

    // Interval stepping
    const intervals = [];
    for (let t = startWindow; t <= endWindow; t += 15 * 60 * 1000) {
        intervals.push(t);
    }

    console.log(`Running simulation over ${intervals.length} intervals...`);

    for (const time of intervals) {
        const timeStr = new Date(time).toISOString().slice(0, 16).replace('T', ' ');
        const dayStart = new Date(time).setUTCHours(0, 0, 0, 0);

        // 1. Manage Active Trades
        activeTrades = activeTrades.filter(t => {
            const data = coinDataMap.get(t.symbol);
            const k = data.k15m.find(cand => cand.time === time);
            if (!k) return true;

            if (k.high > t.peak) t.peak = k.high;

            // SL check (5%)
            const slPrice = t.entry * 0.95;
            if (k.low <= slPrice) {
                history.push({ ...t, exit: slPrice, pnl: -5, timeExit: timeStr, reason: 'SL' });
                freeSlots++;
                return false;
            }

            // Trailing Stop (3% act, 2% distance)
            const profitAtPeak = (t.peak - t.entry) / t.entry;
            if (profitAtPeak >= 0.03) {
                const trailPrice = t.peak * 0.98;
                if (k.low <= trailPrice) {
                    const finalPnl = ((trailPrice - t.entry) / t.entry) * 100;
                    history.push({ ...t, exit: trailPrice, pnl: finalPnl, timeExit: timeStr, reason: 'Trailing' });
                    freeSlots++;
                    return false;
                }
            }
            return true;
        });

        // 2. Scan for Entries
        if (freeSlots > 0) {
            for (const [symbol, data] of coinDataMap) {
                // Rule: 1 trade per token per UTC day
                if (activeTrades.find(t => t.symbol === symbol)) continue;
                if (history.find(h => h.symbol === symbol && new Date(h.timeEntry).setUTCHours(0, 0, 0, 0) === dayStart)) continue;

                const kIdx = data.k15m.findIndex(c => c.time === time);
                if (kIdx <= 1) continue;
                const k = data.k15m[kIdx];
                const prevK = data.k15m[kIdx - 1];

                // Calculate current structural wMax & wMin (only from COMPLETED days before today)
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
                    if (data.k15m[j].time >= dayStart) {
                        qT += data.k15m[j].quoteVolume; bT += data.k15m[j].volume;
                    }
                }
                const cVW = (data.qWeek + qT) / (data.bWeek + bT);
                const volatility = Math.abs(wMax - wMin) / k.close;

                // v7 check
                if (k.close > data.prevWeekVwap && k.close > cVW && k.close > wMax && prevK.close <= wMax && cVW > data.prevWeekVwap && volatility > 0.02) {
                    activeTrades.push({
                        symbol,
                        entry: k.close,
                        peak: k.close,
                        timeEntry: timeStr,
                        day: new Date(time).toISOString().slice(5, 10)
                    });
                    freeSlots--;
                    if (freeSlots === 0) break;
                }
            }
        }
    }

    // Results
    console.log("\n--- TRADE HISTORY ---");
    history.sort((a, b) => a.timeEntry.localeCompare(b.timeEntry));
    history.forEach(h => {
        console.log(`[${h.day}] ${h.symbol.padEnd(10)} | Entry: ${h.timeEntry.slice(11)} | Exit: ${h.timeExit.slice(11)} | PnL: ${h.pnl.toFixed(2).padStart(6)}% | Reason: ${h.reason}`);
    });

    const totalPnL = history.reduce((sum, h) => sum + (slotSize * (h.pnl / 100)), 0);
    console.log(`\nTOTAL PROFIT: $${totalPnL.toFixed(2)} / Initial $${budget}`);
}

runWeeklyAudit();
