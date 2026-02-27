
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(d => ({
            time: d[0] / 1000,
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7]),
            close: parseFloat(d[4])
        }));
    } catch (e) { return []; }
}

async function analyzeFunnels() {
    console.log("--- ANALYZING CONDITION RESTRICTION FUNNEL ---");
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 150);

    const stats = {
        total: 150,
        cond1: 0, // Price > PrevWeekVwap
        cond2: 0, // Price > CurrWeekVwap
        cond3: 0, // Price > Weekly Max
        cond4: 0, // Curr > Prev (Structure)
        cond5: 0, // Volatility > 2%
        cond6: 0, // Fresh Cross
        all: 0
    };

    const getMonTs = (ts) => {
        const d = new Date(ts * 1000);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts * 1000);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    for (const t of candidates) {
        const klines1d = await fetchBinanceKlines(t.symbol, '1d', 30);
        const klines15m = await fetchBinanceKlines(t.symbol, '15m', 5);
        if (klines1d.length < 15 || klines15m.length < 2) continue;

        const lastClose = klines15m[klines15m.length - 1].close;
        const prevClose = klines15m[klines15m.length - 2].close;
        const nowTs = Math.floor(Date.now() / 1000);
        const mondayTs = getMonTs(nowTs);
        const prevMondayTs = mondayTs - (7 * 24 * 3600);

        let wMax = -Infinity, wMin = Infinity;
        const rawVwap = klines1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        klines1d.forEach((k, index) => {
            const dailyVwap = rawVwap[index];
            const kMonTs = getMonTs(k.time);
            if (kMonTs === mondayTs && index < klines1d.length - 1) {
                if (dailyVwap > wMax) wMax = dailyVwap;
                if (dailyVwap < wMin) wMin = dailyVwap;
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        klines1d.forEach(k => {
            const kMonTs = getMonTs(k.time);
            if (kMonTs === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (kMonTs === mondayTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;
        const currentWeekVwap = cB > 0 ? cQ / cB : rawVwap[rawVwap.length - 1];

        const c1 = lastClose > prevWeekVwap;
        const c2 = lastClose > currentWeekVwap;
        const c3 = lastClose > wMax;
        const c4 = currentWeekVwap > prevWeekVwap && prevWeekVwap > 0;
        const volatility = Math.abs(wMax - wMin) / lastClose;
        const c5 = volatility > 0.02;
        const c6 = lastClose > wMax && prevClose <= wMax;

        if (c1) stats.cond1++;
        if (c2) stats.cond2++;
        if (c3) stats.cond3++;
        if (c4) stats.cond4++;
        if (c5) stats.cond5++;
        if (c6) stats.cond6++;
        if (c1 && c2 && c3 && c4 && c5 && c6) stats.all++;
    }

    console.log("Processing complete.");
    console.log(JSON.stringify(stats, null, 2));
}

analyzeFunnels();
