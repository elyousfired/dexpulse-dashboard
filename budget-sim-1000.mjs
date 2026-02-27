
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

async function runBudgetSimulation() {
    console.log("--- BUDGET SIMULATION: $1000 TOTAL CAPITAL ---");
    const START_CAPITAL = 1000;
    const SLOTS = 10;
    const INVEST_PER_SLOT = START_CAPITAL / SLOTS; // $100
    const SL = 5;
    const TRAIL_ACT = 3;
    const TRAIL_DIST = 2;

    const startTs = Date.UTC(2026, 1, 24, 0, 0, 0);

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

    const potentialTrades = [];

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

            let pQ = 0, pB = 0, cQ = 0, cB = 0, wMax = -Infinity;
            k1dPast.forEach(d => {
                const km = getMonTs(d.time);
                if (km === prevMon) { pQ += d.quoteVolume; pB += d.volume; }
                else if (km === curMon) {
                    cQ += d.quoteVolume; cB += d.volume;
                    const v = d.quoteVolume / d.volume;
                    if (v > wMax) wMax = v;
                }
            });
            const pVW = pB > 0 ? pQ / pB : 0;
            const cVW = cB > 0 ? cQ / cB : k1dPast[k1dPast.length - 1].close;

            if (cVW > pVW && k.close > cVW && k15m[idx - 1].close <= cVW && (Math.abs(wMax - cVW) / k.close) > 0.02) {
                hasTraded = true;
                let entry = k.close;
                let exitTs = k15m[k15m.length - 1].time;
                let maxP = entry;
                let trailed = false;
                let profitPct = 0;

                for (let j = idx + 1; j < k15m.length; j++) {
                    const l = k15m[j].low, h = k15m[j].high, c = k15m[j].close;
                    if (h > maxP) maxP = h;
                    if (((maxP - entry) / entry) * 100 >= TRAIL_ACT) trailed = true;
                    if (trailed) {
                        if (((maxP - c) / maxP) * 100 >= TRAIL_DIST) {
                            profitPct = ((c - entry) / entry) * 100;
                            exitTs = k15m[j].time;
                            break;
                        }
                    } else if (((l - entry) / entry) * 100 <= -SL) {
                        profitPct = -SL;
                        exitTs = k15m[j].time;
                        break;
                    }
                }
                potentialTrades.push({ symbol: t.symbol, start: k.time, end: exitTs, profitPct });
            }
        });
    }

    potentialTrades.sort((a, b) => a.start - b.start);

    let activeSlots = [];
    let history = [];

    potentialTrades.forEach(pt => {
        activeSlots = activeSlots.filter(s => s.end > pt.start);
        if (activeSlots.length < SLOTS) {
            activeSlots.push(pt);
            history.push(pt);
        }
    });

    let totalProfit = 0;
    history.forEach(h => {
        totalProfit += (INVEST_PER_SLOT * (h.profitPct / 100));
    });

    console.log(`Summary with $1000 Capital (10 slots of $100):`);
    console.log(`Total Trades Taken: ${history.length}`);
    console.log(`3-Day Net Profit: $${totalProfit.toFixed(2)}`);
}
runBudgetSimulation();
