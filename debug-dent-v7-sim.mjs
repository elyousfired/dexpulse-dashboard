
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

async function debugDentV7() {
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

    // Structural wMax for Feb 26
    const day26 = Date.UTC(2026, 1, 26, 0, 0, 0);
    let wMax = -Infinity;
    const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
    k1d.forEach((dk, idx) => {
        if (getMonTs(dk.time) === monTs && dk.time < day26) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
        }
    });

    console.log(`wMax for Feb 26: ${wMax}`);

    // Check v7 at 05:00
    const k05 = k15m.find(k => new Date(k.time).toISOString().includes("2026-02-26T05:00"));
    const prevK05 = k15m[k15m.indexOf(k05) - 1];
    console.log(`Price at 05:00: ${k05.close} | Prev: ${prevK05.close}`);
    console.log(`Above wMax: ${k05.close > wMax && prevK05.close <= wMax}`);
}
debugDentV7();
