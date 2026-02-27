
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

async function debugMiraRunningVWAP() {
    console.log("--- MIRA/USDT RUNNING VWAP DIAGNOSTIC ---");
    const symbol = 'MIRAUSDT';

    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 40),
        fetchBinanceKlines(symbol, '15m', 400)
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

    // 1. Calculate structural Weekly Max (from previous days this week)
    let wMax = -Infinity;
    k1d.forEach((k, idx) => {
        const dv = k.volume > 0 ? k.quoteVolume / k.volume : k.close;
        if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
            if (dv > wMax) wMax = dv;
        }
    });

    // 2. Calculate running VWAP using 15m klines for accuracy
    let qAcc = 0;
    let bAcc = 0;

    // Accumulate past days of the week from 1d klines (excluding today)
    k1d.forEach((k, idx) => {
        if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
            qAcc += k.quoteVolume;
            bAcc += k.volume;
        }
    });

    console.log(`Weekly Max (Structural): ${wMax}`);

    const startOfDay = Date.UTC(2026, 1, 26, 0, 0, 0);
    k15m.forEach((k, idx) => {
        // Accumulate today's running volume
        if (getMonTs(k.time) === monTs) {
            qAcc += k.quoteVolume;
            bAcc += k.volume;
        }

        if (k.time < startOfDay || idx === 0) return;

        const currentRunningVWAP = bAcc > 0 ? qAcc / bAcc : k.close;
        const price = k.close;
        const prevPrice = k15m[idx - 1].close;

        if (price > currentRunningVWAP && prevPrice <= currentRunningVWAP) {
            console.log(`[ENTRY FOUND] At ${new Date(k.time).toISOString()} | Price: ${price} | Running VWAP: ${currentRunningVWAP.toFixed(6)} | Above WMax: ${price > wMax}`);
        }
    });
}

debugMiraRunningVWAP();
