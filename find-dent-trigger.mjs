
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

async function findDentTrigger() {
    const s = "DENTUSDT";
    const k1d = await fetchBinanceKlines(s, '1d', 40);
    const k15m = await fetchBinanceKlines(s, '15m', 1000);
    const day26 = Date.UTC(2026, 1, 26, 0, 0, 0);

    function getMonTs(ts) {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    }
    const monTs = getMonTs(day26);
    const prevMonTs = monTs - (7 * 24 * 3600);

    let pQ = 0, pB = 0, qW_Base = 0, bW_Base = 0;
    const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
    k1d.forEach((k, idx) => {
        if (getMonTs(k.time) === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
        else if (getMonTs(k.time) === monTs && k.time < day26) { qW_Base += k.quoteVolume; bW_Base += k.volume; }
    });
    const prevWeekVwap = pB > 0 ? pQ / pB : 0;

    let wMax = -Infinity;
    k1d.forEach((dk, idx) => {
        if (getMonTs(dk.time) === monTs && dk.time < day26) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
        }
    });

    for (let i = 0; i < k15m.length; i++) {
        const k = k15m[i];
        if (k.time < day26 || k.time >= day26 + 86400000) continue;

        const prevK = k15m[i - 1];
        let qT = 0, bT = 0;
        for (let j = 0; j <= i; j++) { if (k15m[j].time >= day26) { qT += k15m[j].quoteVolume; bT += k15m[j].volume; } }
        const cVW = (qW_Base + qT) / (bW_Base + bT);

        const isV7 = k.close > prevWeekVwap && k.close > cVW && k.close > wMax && prevK.close <= wMax && cVW > prevWeekVwap;
        if (isV7) {
            console.log(`DENT TRIGGER FOUND! Time: ${new Date(k.time).toISOString()} | Price: ${k.close}`);
        }
    }
}
findDentTrigger();
