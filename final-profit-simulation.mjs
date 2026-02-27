
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

async function runUltimateSimulation() {
    console.log("--- ULTIMATE v7+ TURBO SIMULATION (FEB 26) ---");
    console.log("Strategy: 1 Trade/Token | Trailing Stop (Act: 3%, Trail: 2%) | Hard SL: 5% | $100 Trade");

    const INVEST = 100;
    const HARD_SL = 5;
    const TRAIL_ACT = 3;
    const TRAIL_DIST = 2;

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

    const trades = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 35),
            fetchBinanceKlines(t.symbol, '15m', 150)
        ]);

        if (k1d.length < 15 || k15m.length < 5) continue;

        const currentMondayTs = getMonTs(Date.now());
        const prevMondayTs = currentMondayTs - (7 * 24 * 3600);

        // Weekly Stats
        let wMax = -Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === currentMondayTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        k1d.forEach(k => {
            const kMon = getMonTs(k.time);
            if (kMon === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (kMon === currentMondayTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;
        const currentWeekVwap = cB > 0 ? cQ / cB : dailyVwaps[dailyVwaps.length - 1];

        let dailyQ = 0, dailyB = 0;
        let hasTraded = false;

        k15m.forEach((k, idx) => {
            if (k.time >= startOfDayTs) {
                dailyQ += k.quoteVolume;
                dailyB += k.volume;
            }

            if (k.time < startOfDayTs || idx === 0 || hasTraded) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const dVwap = dailyB > 0 ? dailyQ / dailyB : price;

            // v7+ Turbo Conditions
            const cBull = currentWeekVwap > prevWeekVwap;
            const cMax = price > wMax;
            const cFresh = price > wMax && prevPrice <= wMax;
            const cTurbo = dVwap > currentWeekVwap; // Turbo filter
            const cAboveDVwap = price > dVwap;

            if (cBull && cMax && cFresh && cTurbo && cAboveDVwap) {
                hasTraded = true;
                let entry = price;
                let outcome = 'OPEN';
                let profitUSD = 0;
                let maxP = entry;
                let trailed = false;

                for (let j = idx + 1; j < k15m.length; j++) {
                    const low = k15m[j].low;
                    const high = k15m[j].high;
                    const close = k15m[j].close;

                    if (high > maxP) maxP = high;
                    const pnlH = ((maxP - entry) / entry) * 100;
                    const pnlL = ((low - entry) / entry) * 100;

                    if (pnlH >= TRAIL_ACT) trailed = true;

                    if (trailed) {
                        const drop = ((maxP - close) / maxP) * 100;
                        if (drop >= TRAIL_DIST) {
                            outcome = 'TRAILED';
                            profitUSD = INVEST * ((close - entry) / entry);
                            break;
                        }
                    } else if (pnlL <= -HARD_SL) {
                        outcome = 'STOP LOSS';
                        profitUSD = -INVEST * (HARD_SL / 100);
                        break;
                    }
                }
                trades.push({ symbol: t.symbol, time: k.time, entry, outcome, profitUSD, maxG: ((maxP - entry) / entry) * 100 });
            }
        });
    }

    console.log(`\nSimulation Results (Feb 26):\n`);
    let net = 0;
    trades.forEach(tr => {
        console.log(`| ${new Date(tr.time).toISOString().slice(11, 16)} | ${tr.symbol} | Max: +${tr.maxG.toFixed(2)}% | Outcome: ${tr.outcome} | PnL: $${tr.profitUSD.toFixed(2)} |`);
        net += tr.profitUSD;
    });

    console.log(`\n--- FINAL SUMMARY ---`);
    console.log(`Total Money Invested: $${trades.length * INVEST}`);
    console.log(`Final Net Profit (Feb 26): $${net.toFixed(2)}`);
}

runUltimateSimulation();
