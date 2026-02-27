
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

async function scanV7Today() {
    console.log("--- SCANNING V7 GOLDEN SIGNALS (FEB 27) ---");
    const now = new Date();
    // Start of Feb 27 UTC
    const startOfTodayTs = Date.UTC(2026, 1, 27, 0, 0, 0);

    // Get top symbols by volume
    const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await tickerRes.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 200);

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

    const signals = [];

    for (const t of candidates) {
        // We need 1d klines for VWAP and wMax, and 15m for signal timing
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 40),
            fetchBinanceKlines(t.symbol, '15m', 500)
        ]);

        if (k1d.length < 20 || k15m.length < 10) continue;

        // 1. Weekly Max (Structural - up to yesterday)
        let wMax = -Infinity, wMin = Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
            }
        });

        if (wMax === -Infinity) continue;

        // 2. Weekly VWAPs
        let pQ = 0, pB = 0;
        k1d.forEach(k => {
            if (getMonTs(k.time) === prevMonTs) {
                pQ += k.quoteVolume; pB += k.volume;
            }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        // Running VWAP for current week (accumulate up to today)
        let qWeek = 0, bWeek = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                qWeek += k.quoteVolume;
                bWeek += k.volume;
            }
        });

        // 3. Scan 15m for breakout today
        // We simulate a running week VWAP for each 15m candle by adding today's volume incrementally
        let qToday = 0, bToday = 0;
        for (let i = 0; i < k15m.length; i++) {
            const k = k15m[i];
            const isToday = k.time >= startOfTodayTs;

            // Accumulate today's volume for current week VWAP
            if (k.time >= startOfTodayTs) {
                qToday += k.quoteVolume;
                bToday += k.volume;
            }

            if (!isToday || i === 0) continue;

            const currentWeekVwap = (qWeek + qToday) / (bWeek + bToday);
            const price = k.close;
            const prevPrice = k15m[i - 1].close;
            const volatility = Math.abs(wMax - wMin) / price;

            // v7 Conditions
            const cond1 = price > prevWeekVwap;
            const cond2 = price > currentWeekVwap;
            const cond3 = price > wMax;
            const cond4 = currentWeekVwap > prevWeekVwap && prevWeekVwap > 0;
            const cond5 = volatility > 0.02;
            const cond6 = price > wMax && prevPrice <= wMax;

            if (cond1 && cond2 && cond3 && cond4 && cond5 && cond6) {
                // Find future performance
                let futureMax = price;
                for (let j = i + 1; j < k15m.length; j++) {
                    if (k15m[j].high > futureMax) futureMax = k15m[j].high;
                }
                const gain = ((futureMax - price) / price) * 100;

                signals.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString().slice(11, 16),
                    price: price.toFixed(6),
                    wMax: wMax.toFixed(6),
                    gain: gain.toFixed(2) + "%"
                });
                break; // One signal per coin per day
            }
        }
    }

    signals.sort((a, b) => parseFloat(b.gain) - parseFloat(a.gain));
    console.log(JSON.stringify(signals, null, 2));
}

scanV7Today();
