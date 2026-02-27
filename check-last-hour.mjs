
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

async function checkLastHour() {
    console.log("--- SCANNING FOR GOLDEN SIGNALS (LAST HOUR) ---");
    console.log(`Current Time (UTC): ${new Date().toISOString()}`);

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();

    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .filter(t => parseFloat(t.quoteVolume) > 500000)
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 100);

    for (const t of candidates) {
        const klines1d = await fetchBinanceKlines(t.symbol, '1d', 30);
        const klines1h = await fetchBinanceKlines(t.symbol, '1h', 5);

        if (klines1d.length < 15 || klines1h.length < 2) continue;

        const lastClose = klines1h[klines1h.length - 1].close;
        const prevClose = klines1h[klines1h.length - 2].close;

        const rawVwap = klines1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        let wMax = -Infinity;
        klines1d.forEach((k, i) => {
            if (i < klines1d.length - 1) {
                if (rawVwap[i] > wMax) wMax = rawVwap[i];
            }
        });

        if (lastClose > wMax && prevClose <= wMax) {
            console.log(`[FRESH TRIGGER] ${t.symbol}: Price $${lastClose} just cleared WMax $${wMax.toFixed(4)} in the last hour!`);
        } else if (lastClose > wMax) {
            // Already above
        }
    }
    console.log("Scan complete.");
}

checkLastHour();
