
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

async function debugFogo() {
    console.log("--- FOGO/USDT v7 DIAGNOSTIC (FEB 26) ---");
    const symbol = 'FOGOUSDT';

    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 40),
        fetchBinanceKlines(symbol, '15m', 200)
    ]);

    if (k1d.length < 15) { console.log("Missing 1d data"); return; }

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const currentMondayTs = getMonTs(Date.now());
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
        const km = getMonTs(k.time);
        if (km === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
        else if (km === currentMondayTs) { cQ += k.quoteVolume; cB += k.volume; }
    });
    const pVW = pB > 0 ? pQ / pB : 0;
    const cVW = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

    console.log(`Current Week VWAP: ${cVW} | Prev Week: ${pVW}`);
    console.log(`Weekly Max (v7 Target): ${wMax}`);
    console.log(`Bullish Trend: ${cVW > pVW}`);

    k15m.forEach((k, idx) => {
        if (idx === 0) return;
        const price = k.close;
        const prevPrice = k15m[idx - 1].close;
        const volatility = Math.abs(wMax - cVW) / price;

        if (price > wMax && prevPrice <= wMax) {
            console.log(`\nPotential Signal at ${new Date(k.time).toISOString()}:`);
            console.log(`Price: ${price} | Prev: ${prevPrice} | WMax: ${wMax}`);
            console.log(`Trend Check: ${cVW > pVW}`);
            console.log(`Above CW Check: ${price > cVW}`);
            console.log(`Volatility Check (>2%): ${(volatility * 100).toFixed(2)}%`);
        }
    });
}

debugFogo();
