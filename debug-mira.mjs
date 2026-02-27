
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
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
    } catch (e) { return []; }
}

async function debugMira() {
    console.log("--- MIRA/USDT DIAGNOSTIC (FEB 26) ---");
    const symbol = 'MIRAUSDT';

    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 40),
        fetchBinanceKlines(symbol, '15m', 200)
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

    const monTs = getMonTs(Date.now());
    const prevMonTs = monTs - (7 * 24 * 3600);

    let wMax = -Infinity;
    const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
    k1d.forEach((k, idx) => {
        if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
            if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
        }
    });

    let pQ = 0, pB = 0, cQ = 0, cB = 0;
    k1d.forEach(k => {
        const km = getMonTs(k.time);
        if (km === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
        else if (km === monTs) { cQ += k.quoteVolume; cB += k.volume; }
    });
    const pVW = pB > 0 ? pQ / pB : 0;
    const cVW = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

    console.log(`Current Week VWAP: ${cVW} | Weekly Max: ${wMax}`);
    console.log(`CVW > WMax: ${cVW > wMax}`);

    const startOfDay = Date.UTC(2026, 1, 26, 0, 0, 0);
    k15m.forEach((k, idx) => {
        if (k.time < startOfDay || idx === 0) return;

        const price = k.close;
        const prevPrice = k15m[idx - 1].close;

        // Check standard v7
        if (price > wMax && prevPrice <= wMax) {
            console.log(`[v7 Entry] At ${new Date(k.time).toISOString()} | Price: ${price}`);
        }

        // Check CVW breakout
        if (price > cVW && prevPrice <= cVW) {
            console.log(`[CVW Breakout] At ${new Date(k.time).toISOString()} | Price: ${price}`);
        }
    });
}

debugMira();
