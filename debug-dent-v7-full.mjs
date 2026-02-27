
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return null;
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
    } catch (e) { return null; }
}

async function debugDentV7Full() {
    const s = "DENTUSDT";
    const k1d = await fetchBinanceKlines(s, '1d', 40);
    const k15m = await fetchBinanceKlines(s, '15m', 800);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const monTs = getMonTs(Date.UTC(2026, 1, 26, 0, 0, 0));
    const prevMonTs = monTs - (7 * 24 * 3600);
    const day26 = Date.UTC(2026, 1, 26, 0, 0, 0);

    let pQ = 0, pB = 0, qW_Base = 0, bW_Base = 0;
    const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
    k1d.forEach((k, idx) => {
        if (getMonTs(k.time) === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
        else if (getMonTs(k.time) === monTs && k.time < day26) { qW_Base += k.quoteVolume; bW_Base += k.volume; }
    });
    const prevWeekVwap = pB > 0 ? pQ / pB : 0;

    let wMax = -Infinity, wMin = Infinity;
    k1d.forEach((dk, idx) => {
        if (getMonTs(dk.time) === monTs && dk.time < day26) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
        }
    });

    const kIdx = k15m.findIndex(k => new Date(k.time).toISOString().includes("2026-02-26T05:00"));
    const k = k15m[kIdx];
    const prevK = k15m[kIdx - 1];

    let qT = 0, bT = 0;
    for (let j = 0; j <= kIdx; j++) { if (k15m[j].time >= day26) { qT += k15m[j].quoteVolume; bT += k15m[j].volume; } }
    const cVW = (qW_Base + qT) / (bW_Base + bT);
    const volatility = Math.abs(wMax - wMin) / k.close;

    console.log(`--- DENT FEB 26 v7 CHECK ---`);
    console.log(`Price: ${k.close} | Prev: ${prevK.close}`);
    console.log(`wMax: ${wMax}`);
    console.log(`cVW: ${cVW} | PrevWeekVwap: ${prevWeekVwap}`);
    console.log(`cVW > PrevWeekVwap: ${cVW > prevWeekVwap}`);
    console.log(`Volatility: ${volatility}`);
    console.log(`All Conds: ${k.close > prevWeekVwap && k.close > cVW && k.close > wMax && prevK.close <= wMax && cVW > prevWeekVwap && volatility > 0.02}`);
}
debugDentV7Full();
