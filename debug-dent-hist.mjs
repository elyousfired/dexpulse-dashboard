
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

async function debugDentHistory() {
    const symbol = 'DENTUSDT';
    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 35),
        fetchBinanceKlines(symbol, '15m', 300)
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

    const targetT = new Date("2026-02-24T19:30:00.000Z").getTime();
    const mondayTs = getMonTs(targetT);
    const prevMondayTs = mondayTs - (7 * 24 * 3600);

    // Logic for that specific time
    let wMax = -Infinity, wMin = Infinity;
    const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    // Only use days before the target
    k1d.forEach((k, idx) => {
        if (k.time < targetT && getMonTs(k.time) === mondayTs) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
        }
    });

    let pQ = 0, pB = 0;
    k1d.forEach(k => { if (k.time < targetT && getMonTs(k.time) === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; } });
    const prevWeekVwap = pB > 0 ? pQ / pB : 0;
    const currentWeekVwap = 0.000140; // Approx based on data

    const candle = k15m.find(k => k.time === targetT);
    if (candle) {
        console.log(`--- DENT v7 DIAGNOSTIC (YESTERDAY 19:30 UTC) ---`);
        console.log(`Price ($${candle.close.toFixed(6)}) > WMax ($${wMax.toFixed(6)}): ${candle.close > wMax}`);
        console.log(`Price ($${candle.close.toFixed(6)}) > PrevWeek ($${prevWeekVwap.toFixed(6)}): ${candle.close > prevWeekVwap}`);
    }
}
debugDentHistory();
