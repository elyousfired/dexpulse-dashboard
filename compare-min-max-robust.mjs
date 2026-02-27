
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

async function compareMinMaxFull() {
    console.log("--- FULL v7 COMPARISON: Breakout (Max) vs Reversal (Min) ---");
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

    const statsMax = { total: 0, pnlSum: 0 };
    const statsMin = { total: 0, pnlSum: 0 };

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

        const condTrend = currentWeekVwap > prevWeekVwap && prevWeekVwap > 0;
        const vol = (Math.abs(wMax - wMin) / dailyVwaps[dailyVwaps.length - 1]) > 0.02;

        k15m.forEach((k, idx) => {
            if (k.time < startOfDay || idx === 0) return;

            // CASE A: PRICE > WEEKLY MAX
            const freshA = k.close > wMax && k15m[idx - 1].close <= wMax;
            if (freshA && k.close > prevWeekVwap && k.close > currentWeekVwap && condTrend && vol) {
                let maxH = -Infinity;
                for (let j = idx; j < k15m.length; j++) if (k15m[j].high > maxH) maxH = k15m[j].high;
                statsMax.total++;
                statsMax.pnlSum += ((maxH - k.close) / k.close) * 100;
            }

            // CASE B: PRICE > WEEKLY MIN
            const freshB = k.close > wMin && k15m[idx - 1].close <= wMin;
            if (freshB && k.close > prevWeekVwap && k.close > currentWeekVwap && condTrend && vol) {
                let maxH = -Infinity;
                for (let j = idx; j < k15m.length; j++) if (k15m[j].high > maxH) maxH = k15m[j].high;
                statsMin.total++;
                statsMin.pnlSum += ((maxH - k.close) / k.close) * 100;
            }
        });
    }

    console.log(`\n--- RESULTS (Full v7 Logic) ---`);
    console.log(`Case A (Price > Weekly MAX): Signals: ${statsMax.total} | Avg PnL: +${(statsMax.pnlSum / (statsMax.total || 1)).toFixed(2)}%`);
    console.log(`Case B (Price > Weekly MIN): Signals: ${statsMin.total} | Avg PnL: +${(statsMin.pnlSum / (statsMin.total || 1)).toFixed(2)}%`);
}

compareMinMaxFull();
