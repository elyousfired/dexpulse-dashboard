
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

async function debugDentV7() {
    const symbol = 'DENTUSDT';
    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 35),
        fetchBinanceKlines(symbol, '15m', 150)
    ]);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

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

    let pQ = 0, pB = 0, cQ = 0, cB = 0;
    k1d.forEach(k => {
        const kMon = getMonTs(k.time);
        if (kMon === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
        else if (kMon === mondayTs) { cQ += k.quoteVolume; cB += k.volume; }
    });
    const prevWeekVwap = pB > 0 ? pQ / pB : 0;
    const currentWeekVwap = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

    console.log(`--- DENT v7 DIAGNOSTIC (01:00 AM Today) ---`);
    console.log(`PrevWeekVWAP: $${prevWeekVwap.toFixed(6)}`);
    console.log(`CurrWeekVWAP: $${currentWeekVwap.toFixed(6)}`);
    console.log(`WMax: $${wMax.toFixed(6)}`);

    const triggerT = new Date("2026-02-25T01:00:00.000Z").getTime();
    const candle = k15m.find(k => k.time === triggerT);

    if (candle) {
        const price = candle.close;
        const c1 = price > prevWeekVwap;
        const c2 = price > currentWeekVwap;
        const c3 = price > wMax;
        const c4 = currentWeekVwap > prevWeekVwap;
        const vol = (Math.abs(wMax - wMin) / price) > 0.02;

        console.log(`Price ($${price.toFixed(6)}) > PrevWeek ($${prevWeekVwap.toFixed(6)}): ${c1}`);
        console.log(`Price ($${price.toFixed(6)}) > CurrWeek ($${currentWeekVwap.toFixed(6)}): ${c2}`);
        console.log(`Price ($${price.toFixed(6)}) > WMax ($${wMax.toFixed(6)}): ${c3}`);
        console.log(`CurrWeek > PrevWeek: ${c4}`);
        console.log(`Volatility > 2%: ${vol}`);
    }
}

debugDentV7();
