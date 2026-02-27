
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function findDentBreakout() {
    const symbol = 'DENTUSDT';
    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 35),
        fetchBinanceKlines(symbol, '15m', 300) // ~75 hours
    ]);

    if (k1d.length < 15 || k15m.length < 5) return;

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const nowTs = Date.now();
    const mondayTs = getMonTs(nowTs);
    console.log(`Current Monday (UTC): ${new Date(mondayTs * 1000).toISOString()}`);

    let wMax = -Infinity, wMin = Infinity;
    const rawVwap = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
    k1d.forEach((k, idx) => {
        if (getMonTs(k.time) === mondayTs && idx < k1d.length - 1) {
            if (rawVwap[idx] > wMax) wMax = rawVwap[idx];
            if (rawVwap[idx] < wMin) wMin = rawVwap[idx];
        }
    });

    console.log(`Weekly Levels: Max $${wMax.toFixed(6)}, Min $${wMin.toFixed(6)}`);

    for (let idx = 1; idx < k15m.length; idx++) {
        const k = k15m[idx];
        const prevK = k15m[idx - 1];
        if (k.close > wMax && prevK.close <= wMax) {
            console.log(`[BREAKOUT DETECTED] Time: ${new Date(k.time).toISOString()} | Price: $${k.close}`);
        }
    }
}

findDentBreakout();
