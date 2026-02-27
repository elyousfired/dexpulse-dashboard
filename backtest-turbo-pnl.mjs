
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

async function runTurboSimulation() {
    console.log("--- v7+ TURBO SIMULATION (FEB 26) ---");
    console.log("Rules: TP 4%, SL 2% | Logic: 7-Point Turbo Check");

    const now = new Date();
    const startOfDayTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);

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

    const trades = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 150)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const mondayTs = getMonTs(Date.now());
        const prevMondayTs = mondayTs - (7 * 24 * 3600);

        // Weekly Stats
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

        // 15m Signal Scanning
        let dailyQ = 0, dailyB = 0;

        k15m.forEach((k, idx) => {
            // Update Daily VWAP stats
            if (k.time >= startOfDayTs) {
                dailyQ += k.quoteVolume;
                dailyB += k.volume;
            }

            if (k.time < startOfDayTs || idx === 0) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const dVwap = dailyB > 0 ? dailyQ / dailyB : price;
            const volatility = Math.abs(wMax - wMin) / price;

            // The 7-Point Turbo Check
            const c1 = currentWeekVwap > prevWeekVwap; // 1. Bullish Trend
            const c2 = price > wMax; // 2. Above Weekly Max
            const c3 = price > wMax && prevPrice <= wMax; // 3. Fresh Breakout
            const c4 = dVwap > currentWeekVwap; // 4. TURBO: Daily > Weekly
            const c5 = volatility > 0.02; // 5. Energy (>2%)
            const c6 = price > dVwap; // 6. Above Daily VWAP
            const c7 = price > prevWeekVwap; // 7. Above Prev Week

            if (c1 && c2 && c3 && c4 && c5 && c6 && c7) {
                // Trade Found! Trace it.
                let entry = price;
                let outcome = 'OPEN';
                let gain = 0;

                for (let j = idx + 1; j < k15m.length; j++) {
                    const low = k15m[j].low;
                    const high = k15m[j].high;

                    const pnlHigh = ((high - entry) / entry) * 100;
                    const pnlLow = ((low - entry) / entry) * 100;

                    if (pnlLow <= -6) {
                        outcome = 'STOP LOSS (6%)';
                        gain = -6;
                        break;
                    }
                    if (pnlHigh >= 4) {
                        outcome = 'TAKE PROFIT (4%)';
                        gain = 4;
                        break;
                    }
                }

                trades.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString(),
                    entry,
                    outcome,
                    gain
                });
            }
        });
    }

    console.log(`\nFound ${trades.length} v7+ Turbo Signals Today:\n`);
    console.log(`| Time | Symbol | Entry | Outcome | Gain |`);
    console.log(`| :--- | :--- | :--- | :--- | :--- |`);
    let totalGain = 0;
    trades.forEach(tr => {
        console.log(`| ${tr.time.slice(11, 16)} | ${tr.symbol} | $${tr.entry.toFixed(4)} | ${tr.outcome} | ${tr.gain}% |`);
        totalGain += tr.gain;
    });

    console.log(`\nSIMULATION SUMMARY:`);
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Wins (4%): ${trades.filter(t => t.gain === 4).length}`);
    console.log(`Losses (-2%): ${trades.filter(t => t.gain === -2).length}`);
    console.log(`Open Trades: ${trades.filter(t => t.outcome === 'OPEN').length}`);
    console.log(`Net PnL: ${totalGain.toFixed(2)}%`);
}

runTurboSimulation();
