
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
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
    } catch (e) { return []; }
}

async function runV7Analysis() {
    console.log("--- v7 STANDALONE ANALYSIS (FEB 26) ---");
    const now = new Date();
    const startOfDayTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 150);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const results = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 150)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const currentMondayTs = getMonTs(Date.now());
        const prevMondayTs = currentMondayTs - (7 * 24 * 3600);

        let wMax = -Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === currentMondayTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        k1d.forEach(k => {
            const kMon = getMonTs(k.time);
            if (kMon === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (kMon === currentMondayTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;
        const currentWeekVwap = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

        k15m.forEach((k, idx) => {
            if (k.time < startOfDayTs || idx === 0) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const volatility = Math.abs(wMax - currentWeekVwap) / price;

            // v7 Logic
            const c1 = currentWeekVwap > prevWeekVwap;
            const c2 = price > wMax;
            const c3 = price > wMax && prevPrice <= wMax;
            const c4 = volatility > 0.02;
            const c5 = price > currentWeekVwap;
            const c6 = price > prevWeekVwap;

            if (c1 && c2 && c3 && c4 && c5 && c6) {
                let maxHigh = price;
                let droppedImmediately = true;

                for (let j = idx + 1; j < k15m.length; j++) {
                    if (k15m[j].high > maxHigh) maxHigh = k15m[j].high;
                    // If any subsequent high is > entry, it didn't just "drop from the start" without some profit potential
                    // But if it never goes above entry, it's a "total drop"
                }

                const gain = ((maxHigh - price) / price) * 100;
                if (gain > 0.5) droppedImmediately = false; // Threshold for "immediate drop"

                results.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString().slice(11, 16),
                    entry: price,
                    maxGain: gain,
                    failed: droppedImmediately
                });
            }
        });
    }

    console.log(JSON.stringify(results, null, 2));
}

runV7Analysis();
