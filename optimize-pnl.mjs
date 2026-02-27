
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            close: parseFloat(d[4]),
            high: parseFloat(d[2]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function optimize() {
    console.log("--- STARTING MULTI-PARAMETER OPTIMIZATION (24H DATA) ---");
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).getTime();

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 150);

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

    // Parameters to test
    const volThresholds = [0.01, 0.02, 0.03, 0.05];
    const useDailyVwapFilter = [true, false]; // dVwap > wVwap
    const breakoutLevels = ['max', 'mid'];

    for (const volT of volThresholds) {
        for (const dVwF of useDailyVwapFilter) {
            for (const bL of breakoutLevels) {
                results.push({ volT, dVwF, bL, count: 0, pnl: 0 });
            }
        }
    }

    console.log(`Processing ${candidates.length} tokens for ${results.length} combinations...`);

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 150)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const mondayTs = getMonTs(Date.now());
        const prevMondayTs = mondayTs - (7 * 24 * 3600);

        let wMax = -Infinity, wMin = Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === mondayTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        k1d.forEach(k => {
            const kMon = getMonTs(k.time);
            if (kMon === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (kMon === mondayTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;
        const currentWeekVwap = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];
        const wMid = (wMax + wMin) / 2;

        k15m.forEach((k, idx) => {
            if (k.time < startOfDay || idx === 0) return;
            const volatility = Math.abs(wMax - wMin) / k.close;

            for (const res of results) {
                const targetLevel = res.bL === 'max' ? wMax : wMid;
                const condBreak = k.close > targetLevel && k15m[idx - 1].close <= targetLevel;
                const condVol = volatility > res.volT;
                const condDVW = res.dVwF ? (dailyVwaps[dailyVwaps.length - 1] > currentWeekVwap) : true;
                const condTrend = currentWeekVwap > prevWeekVwap;

                if (condBreak && condVol && condDVW && condTrend && k.close > currentWeekVwap) {
                    let maxH = -Infinity;
                    for (let j = idx; j < k15m.length; j++) if (k15m[j].high > maxH) maxH = k15m[j].high;
                    res.count++;
                    res.pnl += ((maxH - k.close) / k.close) * 100;
                }
            }
        });
    }

    results.forEach(r => {
        r.avgPnl = r.count > 0 ? (r.pnl / r.count).toFixed(2) : 0;
    });

    const sorted = results.sort((a, b) => b.avgPnl - a.avgPnl);

    console.log("\n--- TOP 5 COMBINATIONS ---");
    sorted.slice(0, 5).forEach((s, i) => {
        console.log(`${i + 1}. Vol: ${s.volT * 100}% | DVwapFilter: ${s.dVwF} | Level: ${s.bL} | Signals: ${s.count} | AVG PnL: +${s.avgPnl}%`);
    });
}

optimize();
