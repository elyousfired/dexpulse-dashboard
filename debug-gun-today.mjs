
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            close: parseFloat(d[4]),
            high: parseFloat(d[2]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function debugGunToday() {
    const symbol = 'GUNUSDT';
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

    const startOfDay = new Date(Date.UTC(2026, 1, 26, 0, 0, 0)).getTime(); // Feb 26 00:00
    const now = Date.now();

    const currentMondayTs = getMonTs(now);
    const prevMondayTs = currentMondayTs - (7 * 24 * 3600);

    let wMax = -Infinity, wMin = Infinity;
    const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
    k1d.forEach((k, idx) => {
        if (getMonTs(k.time) === currentMondayTs && idx < k1d.length - 1) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
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

    console.log(`--- GUN v7 CHECK (Feb 26) ---`);
    console.log(`WMax: $${wMax.toFixed(6)} | PrevWeekVwap: $${prevWeekVwap.toFixed(6)} | CurrentWeekVwap: $${currentWeekVwap.toFixed(6)}`);

    k15m.forEach((k, idx) => {
        if (k.time < startOfDay) return;
        if (idx === 0) return;

        const lastClose = k.close;
        const prevClose = k15m[idx - 1].close;

        const c1 = lastClose > prevWeekVwap;
        const c2 = lastClose > currentWeekVwap;
        const c3 = lastClose > wMax;
        const volatility = Math.abs(wMax - wMin) / lastClose;
        const c5 = volatility > 0.02;
        const c6 = lastClose > wMax && prevClose <= wMax;

        if (c3 && c6) {
            console.log(`[PASS C3+C6] Time: ${new Date(k.time).toISOString()} | Price: $${lastClose} | Vol: ${(volatility * 100).toFixed(2)}% | C1: ${c1}, C2: ${c2}, C5: ${c5}`);
        }
    });
}

debugGunToday();
