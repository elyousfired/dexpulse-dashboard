
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

async function debugDotV7() {
    const symbol = 'DOTUSDT';
    console.log(`--- DEBUGGING ${symbol} v7 LOGIC ---`);

    const klines1d = await fetchBinanceKlines(symbol, '1d', 30);
    const klines15m = await fetchBinanceKlines(symbol, '15m', 150); // Large lookback to find the trigger

    if (klines1d.length < 15 || klines15m.length < 5) return;

    // Weekly Max Calculation
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

    console.log(`Levels: WMax: $${wMax.toFixed(4)}, WMin: $${wMin.toFixed(4)}, PrevVWAP: $${prevWeekVwap.toFixed(4)}, CurrVWAP: $${currentWeekVwap.toFixed(4)}`);

    // Search for the point of breakout
    let found = false;
    for (let i = 1; i < klines15m.length; i++) {
        const lastClose = klines15m[i].close;
        const prevClose = klines15m[i - 1].close;

        const cond1 = lastClose > prevWeekVwap;
        const cond2 = lastClose > currentWeekVwap;
        const cond3 = lastClose > wMax;
        const cond4 = currentWeekVwap > prevWeekVwap;
        const volatility = Math.abs(wMax - wMin) / lastClose;
        const cond5 = volatility > 0.02;
        const fresh = lastClose > wMax && prevClose <= wMax;

        if (cond1 && cond2 && cond3 && cond4 && cond5 && fresh) {
            console.log(`[TRIGGERED] Time: ${new Date(klines15m[i].time * 1000).toISOString()} | Price: $${lastClose}`);
            found = true;
        }
    }

    if (!found) {
        console.log("No v7 Golden Signal found in the last 150 candlesticks.");
    }
}

debugDotV7();
