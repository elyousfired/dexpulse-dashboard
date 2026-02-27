
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

async function runDeepMissedScan() {
    console.log("--- DEEP SCAN MISSED WINDOW (02:00 - 18:00 UTC) ---");
    const startWindow = Date.UTC(2026, 1, 26, 2, 0, 0);
    const endWindow = Date.UTC(2026, 1, 26, 18, 0, 0);

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 300); // Expanded to 300

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const signals = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 200)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const monTs = getMonTs(Date.now());
        const prevMonTs = monTs - (7 * 24 * 3600);

        let wMax = -Infinity, wMin = Infinity;
        k1d.forEach((k, idx) => {
            const dv = k.volume > 0 ? k.quoteVolume / k.volume : k.close;
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                if (dv > wMax) wMax = dv;
                if (dv < wMin) wMin = dv;
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        k1d.forEach(k => {
            const km = getMonTs(k.time);
            if (km === prevMonTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (km === monTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const pVW = pB > 0 ? pQ / pB : 0;
        const cVW = cB > 0 ? cQ / cB : k1d[k1d.length - 1].close;

        k15m.forEach((k, idx) => {
            if (k.time < startWindow || k.time > endWindow || idx === 0) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const volatility = (Math.abs(wMax - wMin) / price);

            if (cVW > pVW && price > wMax && prevPrice <= wMax && volatility > 0.02) {
                signals.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString().slice(11, 16),
                    entry: price
                });
            }
        });
    }

    console.log(JSON.stringify(signals, null, 2));
}

runDeepMissedScan();
