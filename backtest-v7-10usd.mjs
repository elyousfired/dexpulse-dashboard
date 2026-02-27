
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

async function runV7_10USD_Simulation() {
    console.log("--- v7 $10 PER TRADE SIMULATION (FEB 26) ---");
    const INVEST = 10;
    const TP = 4;
    const SL = 6;

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

        const currentMondayTs = getMonTs(Date.now());
        const prevMondayTs = currentMondayTs - (7 * 24 * 3600);

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

        k15m.forEach((k, idx) => {
            if (k.time < startOfDayTs || idx === 0) return;

            const price = k.close;
            const prevPrice = k15m[idx - 1].close;
            const volatility = Math.abs(wMax - currentWeekVwap) / price;

            // v7 Logic
            const cBull = currentWeekVwap > prevWeekVwap;
            const cAbove = price > wMax;
            const cFresh = price > wMax && prevPrice <= wMax;
            const cVol = volatility > 0.02;
            const cAboveCW = price > currentWeekVwap;
            const cAbovePW = price > prevWeekVwap;

            if (cBull && cAbove && cFresh && cVol && cAboveCW && cAbovePW) {
                let entry = price;
                let outcome = 'OPEN';
                let gainUSD = 0;

                for (let j = idx + 1; j < k15m.length; j++) {
                    const l = k15m[j].low, h = k15m[j].high;
                    const pnlH = ((h - entry) / entry) * 100;
                    const pnlL = ((l - entry) / entry) * 100;

                    if (pnlL <= -SL) {
                        outcome = 'STOP LOSS';
                        gainUSD = -INVEST * (SL / 100);
                        break;
                    }
                    if (pnlH >= TP) {
                        outcome = 'TAKE PROFIT';
                        gainUSD = INVEST * (TP / 100);
                        break;
                    }
                }
                trades.push({ symbol: t.symbol, time: k.time, outcome, gainUSD });
            }
        });
    }

    let net = 0;
    trades.forEach(tr => {
        net += tr.gainUSD;
    });

    console.log(`Summary:`);
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Wins (+$0.40): ${trades.filter(t => t.gainUSD > 0).length}`);
    console.log(`Losses (-$0.60): ${trades.filter(t => t.gainUSD < 0).length}`);
    console.log(`Open: ${trades.filter(t => t.outcome === 'OPEN').length}`);
    console.log(`Net Profit: $${net.toFixed(2)}`);
}

runV7_10USD_Simulation();
