
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

async function debugFogoDent() {
    console.log("--- FOGO & DENT v7 SCAN (FEB 26) ---");
    const symbols = ['FOGOUSDT', 'DENTUSDT'];

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

    for (const s of symbols) {
        console.log(`\nAnalyzing ${s}...`);
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 200)
        ]);

        if (k1d.length < 20) continue;

        let wMax = -Infinity, wMin = Infinity;
        k1d.forEach((k, idx) => {
            const dailyVwap = k.volume > 0 ? k.quoteVolume / k.volume : k.close;
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                if (dailyVwap > wMax) wMax = dailyVwap;
                if (dailyVwap < wMin) wMin = dailyVwap;
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

        const volatility = (Math.abs(wMax - wMin) / k15m[k15m.length - 1].close);
        console.log(`Weekly Max: ${wMax} | CW VWAP: ${cVW} | Bullish: ${cVW > pVW} | Volatility: ${(volatility * 100).toFixed(2)}%`);

        k15m.forEach((k, idx) => {
            if (idx === 0) return;
            const price = k.close;
            const prevPrice = k15m[idx - 1].close;

            // v7 Logic
            if (cVW > pVW && price > wMax && prevPrice <= wMax && volatility > 0.02) {
                console.log(`[!] GOLDEN SIGNAL at ${new Date(k.time).toISOString()} | Price: ${price}`);
            }
        });
    }
}

debugFogoDent();
