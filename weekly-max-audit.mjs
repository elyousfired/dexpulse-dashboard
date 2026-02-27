
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

async function runMaxGainAudit() {
    console.log("--- WEEKLY MAX GAIN AUDIT (FEB 25 - FEB 27) ---");
    const symbolsRaw = ["om", "virtual", "wld", "gun", "ksm", "pendle", "bard", "fogo", "jst", "dent", "kite", "wbeth", "sky", "uni", "lunc", "zbt", "mira", "morpho", "dot"];
    const symbols = [...new Set(symbolsRaw.map(s => s.toUpperCase() + "USDT"))];

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

    const finalResults = [];

    for (const s of symbols) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 800)
        ]);

        if (!k1d || k1d.length < 20 || !k15m) continue;

        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        let pQ = 0, pB = 0, qW_Base = 0, bW_Base = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) {
                pQ += k.quoteVolume; pB += k.volume;
            } else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                qW_Base += k.quoteVolume; bW_Base += k.volume;
            }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        let qToday = 0, bToday = 0;
        let lastDayProcessed = -1;

        for (let i = 0; i < k15m.length; i++) {
            const k = k15m[i];
            if (k.time < startWindow) continue;

            const dayTs = new Date(k.time).setUTCHours(0, 0, 0, 0);
            if (dayTs !== lastDayProcessed) {
                qToday = 0; bToday = 0;
                lastDayProcessed = dayTs;
            }
            qToday += k.quoteVolume; bToday += k.volume;

            if (i === 0) continue;

            const prevK = k15m[i - 1];

            // Running Weekly VWAP
            const currentWeekVwap = (qW_Base + qToday) / (bW_Base + bToday);

            // Structural Max (from days before current day)
            let wMax = -Infinity, wMin = Infinity;
            k1d.forEach((dk, idx) => {
                if (getMonTs(dk.time) === monTs && dk.time < dayTs) {
                    if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                    if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
                }
            });

            if (wMax === -Infinity) continue;

            const volatility = Math.abs(wMax - wMin) / k.close;

            // v7 Conditions
            const isV7 = k.close > prevWeekVwap && k.close > currentWeekVwap && k.close > wMax && prevK.close <= wMax && currentWeekVwap > prevWeekVwap && volatility > 0.02;

            if (isV7) {
                // Find Max Gain reached after this entry
                let absoluteMax = k.close;
                for (let j = i + 1; j < k15m.length; j++) {
                    if (k15m[j].high > absoluteMax) absoluteMax = k15m[j].high;
                }
                const maxGain = ((absoluteMax - k.close) / k.close) * 100;

                finalResults.push({
                    symbol: s.replace('USDT', ''),
                    date: new Date(k.time).toISOString().slice(5, 10),
                    time: new Date(k.time).toISOString().slice(11, 16),
                    entry: k.close,
                    maxPrice: absoluteMax,
                    gain: maxGain
                });
                break; // One signal per coin per week (or first one found) - following user's "max of these"
            }
        }
    }

    finalResults.sort((a, b) => b.gain - a.gain);
    console.log(JSON.stringify(finalResults, null, 2));
}

runMaxGainAudit();
