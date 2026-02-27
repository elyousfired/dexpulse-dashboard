
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function debugGunV7() {
    const symbol = 'GUNUSDT';
    console.log(`--- DEBUGGING ${symbol} v7 LOGIC ---`);

    const klines1d = await fetchBinanceKlines(symbol, '1d', 30);
    const klines15m = await fetchBinanceKlines(symbol, '15m', 5);

    if (klines1d.length < 15 || klines15m.length < 3) {
        console.error("Not enough data");
        return;
    }

    const lastClose = klines15m[klines15m.length - 1].close;
    const prevClose = klines15m[klines15m.length - 2].close;

    // Helper for Monday Calculation
    const getMonTs = (ts) => {
        const d = new Date(ts * 1000);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts * 1000);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const nowTs = Math.floor(Date.now() / 1000);
    const mondayTs = getMonTs(nowTs);
    const prevMondayTs = mondayTs - (7 * 24 * 3600);

    let wMax = -Infinity, wMin = Infinity;
    const rawVwap = klines1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    klines1d.forEach((k, index) => {
        const dailyVwap = rawVwap[index];
        const isCompletedDay = index < klines1d.length - 1;
        const kMonTs = getMonTs(k.time);
        if (kMonTs === mondayTs && isCompletedDay) {
            if (dailyVwap > wMax) wMax = dailyVwap;
            if (dailyVwap < wMin) wMin = dailyVwap;
        }
    });

    // Prev Week VWAP
    let pQVol = 0, pBVol = 0, cQVol = 0, cBVol = 0;
    klines1d.forEach(k => {
        const kMonTs = getMonTs(k.time);
        if (kMonTs === prevMondayTs) {
            pQVol += k.quoteVolume; pBVol += k.volume;
        } else if (kMonTs === mondayTs) {
            cQVol += k.quoteVolume; cBVol += k.volume;
        }
    });

    const prevWeekVwap = pBVol > 0 ? pQVol / pBVol : 0;
    const currentWeekVwap = cBVol > 0 ? cQVol / cBVol : rawVwap[rawVwap.length - 1];

    // THE 6 POINTS
    const cond1 = lastClose > prevWeekVwap;
    const cond2 = lastClose > currentWeekVwap;
    const cond3 = lastClose > wMax;
    const cond4 = currentWeekVwap > prevWeekVwap;
    const volatility = Math.abs(wMax - wMin) / lastClose;
    const cond5 = volatility > 0.02;
    const fresh = lastClose > wMax && prevClose <= wMax;

    console.log(`1. Price > PrevWeekVwap ($${prevWeekVwap.toFixed(4)}): ${cond1}`);
    console.log(`2. Price > CurrWeekVwap ($${currentWeekVwap.toFixed(4)}): ${cond2}`);
    console.log(`3. Price > Weekly Max ($${wMax.toFixed(4)}): ${cond3}`);
    console.log(`4. CurrWeekVwap > PrevWeekVwap: ${cond4}`);
    console.log(`5. Volatility Hurdle (${(volatility * 100).toFixed(2)}% > 2%): ${cond5} (WMax: $${wMax.toFixed(4)}, WMin: $${wMin.toFixed(4)})`);
    console.log(`6. Fresh Breakout Cross: ${fresh} (Prev: $${prevClose}, Last: $${lastClose})`);

    const final = cond1 && cond2 && cond3 && cond4 && cond5 && fresh;
    console.log(`--- FINAL VERDICT: ${final ? "✅ TRIGGERED" : "❌ FILTERED OUT"} ---`);
}

debugGunV7();
