
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

async function runProfitOptimization() {
    console.log("--- v7+ TURBO PROFIT OPTIMIZATION (FEB 26) ---");
    console.log("Strategy: 1 Trade Per Coin | TP 6% | SL 4% | Risk/Reward: 1.5");

    const INVEST_PER_TRADE = 100;
    const TP = 6;
    const SL = 4;

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

        let dailyQ = 0, dailyB = 0;
        let hasTradedToday = false;

        k15m.forEach((k, idx) => {
            if (k.time >= startOfDayTs) {
                dailyQ += k.quoteVolume;
                dailyB += k.volume;
            }

            if (k.time < startOfDayTs || idx === 0 || hasTradedToday) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const dVwap = dailyB > 0 ? dailyQ / dailyB : price;
            const volatility = Math.abs(wMax - wMin) / price;

            const cTrend = currentWeekVwap > prevWeekVwap;
            const cAboveMax = price > wMax;
            const cFresh = price > wMax && prevPrice <= wMax;
            const cTurbo = dVwap > currentWeekVwap;
            const cVol = volatility > 0.02;
            const cAboveDVwap = price > dVwap;

            if (cTrend && cAboveMax && cFresh && cTurbo && cVol && cAboveDVwap) {
                hasTradedToday = true; // Limitation rule applied here

                let entry = price;
                let outcome = 'OPEN';
                let profitUSD = 0;

                for (let j = idx + 1; j < k15m.length; j++) {
                    const low = k15m[j].low;
                    const high = k15m[j].high;
                    const pnlH = ((high - entry) / entry) * 100;
                    const pnlL = ((low - entry) / entry) * 100;

                    if (pnlL <= -SL) {
                        outcome = 'STOP LOSS';
                        profitUSD = -INVEST_PER_TRADE * (SL / 100);
                        break;
                    }
                    if (pnlH >= TP) {
                        outcome = 'TAKE PROFIT';
                        profitUSD = INVEST_PER_TRADE * (TP / 100);
                        break;
                    }
                }

                trades.push({
                    symbol: t.symbol,
                    time: new Date(k.time).toISOString(),
                    entry,
                    outcome,
                    profitUSD
                });
            }
        });
    }

    console.log(`\nOptimization Results ($100/Trade, 6%/4% RR, 1 Trade/Coin):\n`);
    let totalCash = 0;
    trades.forEach(tr => {
        console.log(`| ${tr.time.slice(11, 16)} | ${tr.symbol} | Outcome: ${tr.outcome} | Profit: $${tr.profitUSD.toFixed(2)} |`);
        totalCash += tr.profitUSD;
    });

    console.log(`\nSUMMARY:`);
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Wins (+$6.00): ${trades.filter(t => t.profitUSD > 0).length}`);
    console.log(`Losses (-$4.00): ${trades.filter(t => t.profitUSD < 0).length}`);
    console.log(`Open: ${trades.filter(t => t.outcome === 'OPEN').length}`);
    console.log(`Final Net: $${totalCash.toFixed(2)}`);
}

runProfitOptimization();
