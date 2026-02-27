
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

async function runNewStrategyTest() {
    console.log("--- TEST STRATEGY: Current Week VWAP > Weekly Max ---");
    console.log("Entry: First 15m Close > Current Week VWAP (Starting 00:00 Today)");

    const now = new Date();
    const startOfDayTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
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

    const results = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 150)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const monTs = getMonTs(Date.now());

        let wMax = -Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            // Only look at completed days for Weekly Max structural level
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            }
        });

        // Current cumulative week VWAP
        let cQ = 0, cB = 0;
        k1d.forEach(k => {
            if (getMonTs(k.time) === monTs) {
                cQ += k.quoteVolume;
                cB += k.volume;
            }
        });
        const cVW = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

        // NEW STRATEGY CONDITION
        const condition = cVW > wMax;

        if (condition) {
            // Find first entry today
            let entry = null;
            let entryIdx = -1;

            for (let i = 1; i < k15m.length; i++) {
                if (k15m[i].time >= startOfDayTs) {
                    if (k15m[i].close > cVW && k15m[i - 1].close <= cVW) {
                        entry = k15m[i].close;
                        entryIdx = i;
                        break;
                    }
                }
            }

            if (entry) {
                let maxHigh = entry;
                let minLow = entry;
                for (let j = entryIdx + 1; j < k15m.length; j++) {
                    if (k15m[j].high > maxHigh) maxHigh = k15m[j].high;
                    if (k15m[j].low < minLow) minLow = k15m[j].low;
                }
                const gain = ((maxHigh - entry) / entry) * 100;
                const dd = ((minLow - entry) / entry) * 100;

                results.push({
                    symbol: t.symbol,
                    time: new Date(k15m[entryIdx].time).toISOString().slice(11, 16),
                    cVW: cVW.toFixed(6),
                    wMax: wMax.toFixed(6),
                    entry: entry.toFixed(6),
                    maxGain: gain.toFixed(2) + "%",
                    drawdown: dd.toFixed(2) + "%"
                });
            }
        }
    }

    console.log(JSON.stringify(results, null, 2));
}

runNewStrategyTest();
