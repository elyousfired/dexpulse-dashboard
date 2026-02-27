
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
            low: parseFloat(d[3]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function runWeeklySimulation() {
    console.log("--- v7+ TURBO 3-DAY PERFORMANCE (FEB 24 - FEB 26) ---");
    const INVEST = 100;
    const SL = 5;
    const TRAIL_ACT = 3;
    const TRAIL_DIST = 2;

    const startTs = Date.UTC(2026, 1, 24, 0, 0, 0); // Feb 24

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 100);

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
            fetchBinanceKlines(t.symbol, '1d', 40),
            fetchBinanceKlines(t.symbol, '15m', 500)
        ]);

        if (k1d.length < 20 || k15m.length < 100) continue;

        let hasTraded = false;

        k15m.forEach((k, idx) => {
            if (k.time < startTs || idx === 0 || hasTraded) return;

            const targetTime = k.time;
            const k1dPast = k1d.filter(d => d.time < targetTime);
            if (k1dPast.length < 15) return;

            const curMon = getMonTs(targetTime);
            const prevMon = curMon - (7 * 24 * 3600);

            // Calc VWAPs at T
            let pQ = 0, pB = 0, cQ = 0, cB = 0;
            let wMax = -Infinity;
            k1dPast.forEach(d => {
                const km = getMonTs(d.time);
                const v = d.quoteVolume / d.volume;
                if (km === prevMon) { pQ += d.quoteVolume; pB += d.volume; }
                else if (km === curMon) {
                    cQ += d.quoteVolume; cB += d.volume;
                    if (v > wMax) wMax = v;
                }
            });

            const pVW = pB > 0 ? pQ / pB : 0;
            const cVW = cB > 0 ? cQ / cB : k1dPast[k1dPast.length - 1].close;

            // v7 Check
            const cBull = cVW > pVW;
            const cAbove = k.close > cVW;
            const cFresh = k.close > cVW && k15m[idx - 1].close <= cVW;
            const cVol = (Math.abs(wMax - cVW) / k.close) > 0.02;

            if (cBull && cAbove && cFresh && cVol) {
                hasTraded = true;
                let entry = k.close;
                let outcome = 'OPEN';
                let profit = 0;
                let maxP = entry;
                let trailActive = false;

                for (let j = idx + 1; j < k15m.length; j++) {
                    const l = k15m[j].low;
                    const h = k15m[j].high;
                    const c = k15m[j].close;
                    if (h > maxP) maxP = h;

                    const pnlH = ((maxP - entry) / entry) * 100;
                    const pnlL = ((l - entry) / entry) * 100;

                    if (pnlH >= TRAIL_ACT) trailActive = true;

                    if (trailActive) {
                        const drop = ((maxP - c) / maxP) * 100;
                        if (drop >= TRAIL_DIST) {
                            outcome = 'TRAILED';
                            profit = INVEST * ((c - entry) / entry);
                            break;
                        }
                    } else if (pnlL <= -SL) {
                        outcome = 'STOP LOSS';
                        profit = -INVEST * (SL / 100);
                        break;
                    }
                }
                trades.push({ symbol: t.symbol, time: k.time, outcome, profit, maxG: ((maxP - entry) / entry) * 100 });
            }
        });
    }

    let net = 0;
    console.log(`\n3-Day Strategy Results:\n`);
    trades.forEach(tr => {
        console.log(`| ${new Date(tr.time).toISOString().slice(5, 16)} | ${tr.symbol} | Max: +${tr.maxG.toFixed(2)}% | Outcome: ${tr.outcome} | PnL: $${tr.profit.toFixed(2)} |`);
        net += tr.profit;
    });

    console.log(`\n--- 3-DAY SUMMARY ---`);
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Final Net Profit: $${net.toFixed(2)}`);
}

runWeeklySimulation();
