
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

async function runBacktestZeroVol() {
    console.log("--- STARTING 24H BACKTEST (VOLATILITY = 0%) ---");
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 100);

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
            fetchBinanceKlines(t.symbol, '15m', 110)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const mondayTs = getMonTs(Date.now());
        const prevMondayTs = mondayTs - (7 * 24 * 3600);

        let wMax = -Infinity, wMin = Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === mondayTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
            }
        });

        let pQ = 0, pB = 0;
        k1d.forEach(k => {
            if (getMonTs(k.time) === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        k15m.forEach((k, idx) => {
            if (k.time < startOfDay.getTime()) return;
            if (idx === 0) return;

            const lastClose = k.close;
            const prevClose = k15m[idx - 1].close;
            const currWeekVwap = dailyVwaps[dailyVwaps.length - 1];

            const c1 = lastClose > prevWeekVwap;
            const c2 = lastClose > currWeekVwap; // Fixed variable name
            const c3 = lastClose > wMax;
            const c4 = currWeekVwap > prevWeekVwap && prevWeekVwap > 0;
            const c5 = true; // VOLATILITY OVERRIDE TO 0%
            const c6 = lastClose > wMax && prevClose <= wMax;

            if (c1 && c2 && c3 && c4 && c5 && c6) {
                let maxPrice = -Infinity;
                for (let j = idx; j < k15m.length; j++) {
                    if (k15m[j].high > maxPrice) maxPrice = k15m[j].high;
                }
                const maxGain = ((maxPrice - lastClose) / lastClose) * 100;
                const realVol = (Math.abs(wMax - wMin) / lastClose) * 100;

                triggers.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString(),
                    price: lastClose,
                    pnl: maxGain.toFixed(2),
                    vol: realVol.toFixed(2)
                });
            }
        });
    }

    console.log(`\nFound ${triggers.length} Signals with VOLATILITY = 0%:`);
    triggers.forEach(tr => {
        console.log(`[${tr.time}] ${tr.symbol}: +${tr.pnl}% (Actual Vol: ${tr.vol}%)`);
    });

    const avgGain = triggers.reduce((acc, tr) => acc + parseFloat(tr.pnl), 0) / (triggers.length || 1);
    console.log(`\nSUMMARY (ZERO VOL):`);
    console.log(`Total Signals: ${triggers.length}`);
    console.log(`Average Max PnL: +${avgGain.toFixed(2)}%`);
}

runBacktestZeroVol();
