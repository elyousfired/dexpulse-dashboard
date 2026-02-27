
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

async function runMissedWindowAnalysis() {
    console.log("--- SCANNING MISSED WINDOW (02:00 - 18:00 UTC) ---");
    const startWindow = Date.UTC(2026, 1, 26, 2, 0, 0);
    const endWindow = Date.UTC(2026, 1, 26, 18, 0, 0);
    const fullEnd = Date.UTC(2026, 1, 26, 23, 59, 59);

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

    const signals = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 200)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const mondayTs = getMonTs(Date.now());
        const prevMondayTs = mondayTs - (7 * 24 * 3600);

        let wMax = -Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === mondayTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        k1d.forEach(k => {
            const kMon = getMonTs(k.time);
            if (kMon === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (kMon === mondayTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;
        const currentWeekVwap = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

        k15m.forEach((k, idx) => {
            if (k.time < startWindow || k.time > endWindow || idx === 0) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const volatility = Math.abs(wMax - currentWeekVwap) / price;

            // v7 Logic
            if (currentWeekVwap > prevWeekVwap &&
                price > wMax &&
                price > wMax && prevPrice <= wMax &&
                volatility > 0.02 &&
                price > currentWeekVwap &&
                price > prevWeekVwap) {

                let futureMax = price;
                for (let j = idx + 1; j < k15m.length; j++) {
                    if (k15m[j].high > futureMax) futureMax = k15m[j].high;
                }
                const maxGain = ((futureMax - price) / price) * 100;

                signals.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString().slice(11, 16),
                    entry: price,
                    maxGain: maxGain.toFixed(2) + "%"
                });
            }
        });
    }

    console.log(JSON.stringify(signals, null, 2));
}

runMissedWindowAnalysis();
