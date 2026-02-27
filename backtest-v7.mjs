
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
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

async function runBacktest() {
    console.log("--- STARTING EXPANDED 24H GOLDEN BACKTEST (v7) ---");
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    console.log(`Analyzing Feb 26 from: ${startOfDay.toISOString()} to ${now.toISOString()}`);

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 200); // Expanded to 200 to catch mid-caps

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const triggers = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 150)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const mondayTs = getMonTs(Date.now());
        const prevMondayTs = mondayTs - (7 * 24 * 3600);

        let wMax = -Infinity, wMin = Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        k1d.forEach((k, idx) => {
            const kMon = getMonTs(k.time);
            if (kMon === mondayTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
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
            if (k.time < startOfDay.getTime()) return;
            if (idx === 0) return;

            const lastClose = k.close;
            const prevClose = k15m[idx - 1].close;

            const c1 = lastClose > prevWeekVwap;
            const c2 = lastClose > currentWeekVwap;
            const c3 = lastClose > wMax;
            const c4 = currentWeekVwap > prevWeekVwap && prevWeekVwap > 0;
            const volatility = Math.abs(wMax - wMin) / lastClose;
            const c5 = volatility > 0.02;
            const c6 = lastClose > wMax && prevClose <= wMax;

            if (c1 && c2 && c3 && c4 && c5 && c6) {
                let maxPrice = -Infinity;
                for (let j = idx; j < k15m.length; j++) {
                    if (k15m[j].high > maxPrice) maxPrice = k15m[j].high;
                }
                const maxGain = ((maxPrice - lastClose) / lastClose) * 100;

                triggers.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString(),
                    price: lastClose,
                    pnl: maxGain.toFixed(2),
                    vol: (volatility * 100).toFixed(2)
                });
            }
        });
    }

    console.log(`\nFound ${triggers.length} Valid Golden Signals Today (Feb 26, Top 200):`);
    triggers.forEach(tr => {
        console.log(`[${tr.time}] ${tr.symbol}: Entry $${tr.price} | Max Gain: +${tr.pnl}% | Vol: ${tr.vol}%`);
    });
}

runBacktest();
