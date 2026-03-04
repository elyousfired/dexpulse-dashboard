
import axios from 'axios';

async function fetchBinanceKlines(symbol, interval, limit) {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    try {
        const res = await axios.get(url);
        return res.data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (err) { return []; }
}

const getMonTs = (ts) => {
    const d = new Date(ts);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const mon = new Date(ts);
    mon.setUTCHours(0, 0, 0, 0);
    mon.setUTCDate(mon.getUTCDate() - diff);
    return Math.floor(mon.getTime() / 1000);
};

async function runWeeklyBurst() {
    console.log(`\n🚀 Analyzing THE EXPLOSIVE WEEK (Feb 23 - Mar 2)`);
    console.log(`📡 Strategy: V7 Golden Signal (Top 50 Symbols)`);
    console.log(`-----------------------------------------------`);

    const res = await axios.get('https://data-api.binance.vision/api/v3/ticker/24hr');
    const top50 = res.data
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 50)
        .map(t => t.symbol);

    let totalGain = 0;
    let totalWins = 0;
    let totalTrades = 0;

    for (const symbol of top50) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(symbol, '1d', 40),
            fetchBinanceKlines(symbol, '15m', 15 * 96) // 15 days of 15m
        ]);

        if (k1d.length < 10 || k15m.length < 100) continue;

        let inPos = false;
        let entry = 0;
        let peak = 0;

        k15m.forEach((k, idx) => {
            if (idx === 0) return;
            const nowTs = k.time;
            const mondayTs = getMonTs(nowTs);
            const prevMondayTs = mondayTs - (7 * 24 * 3600);

            let wMax = -Infinity, wMin = Infinity;
            let currentDayVwap = 0, prevWeekQ = 0, prevWeekV = 0, currWeekQ = 0, currWeekV = 0;

            k1d.forEach(dk => {
                const dkMon = getMonTs(dk.time);
                const dVwap = dk.quoteVolume / dk.volume;
                if (dkMon === mondayTs && dk.time < nowTs - (24 * 3600 * 1000)) {
                    if (dVwap > wMax) wMax = dVwap;
                    if (dVwap < wMin) wMin = dVwap;
                }
                if (dkMon === prevMondayTs) { prevWeekQ += dk.quoteVolume; prevWeekV += dk.volume; }
                else if (dkMon === mondayTs && dk.time <= nowTs) { currWeekQ += dk.quoteVolume; currWeekV += dk.volume; }
                if (dk.time <= nowTs && dk.time + 86400000 > nowTs) currentDayVwap = dVwap;
            });

            const pWV = prevWeekV > 0 ? prevWeekQ / prevWeekV : 0;
            const cWV = currWeekV > 0 ? currWeekQ / currWeekV : currentDayVwap;
            if (wMax === -Infinity) wMax = currentDayVwap;
            if (wMin === Infinity) wMin = currentDayVwap;

            const vol = Math.abs(wMax - wMin) / k.close;
            const isGolden = k.close > pWV && k.close > cWV && k.close > wMax && pWV > 0 && vol > 0.02 && k.close > wMax && k15m[idx - 1].close <= wMax;

            if (!inPos && isGolden) {
                inPos = true; entry = k.close; peak = k.close; totalTrades++;
            } else if (inPos) {
                if (k.high > peak) peak = k.high;
                const pnl = ((k.low - entry) / entry) * 100;
                // Simple SL logic for quick burst analysis
                if (pnl <= -4 || k.close < wMax) {
                    const final = ((k.close - entry) / entry) * 100;
                    totalGain += final; inPos = false; if (final > 0) totalWins++;
                }
            }
        });
    }

    console.log(`\n✅ Burst Analysis (Top 50):`);
    console.log(`   Trades: ${totalTrades} | WinRate: ${((totalWins / totalTrades) * 100).toFixed(2)}% | Total PnL: ${totalGain.toFixed(2)}%`);
}

runWeeklyBurst();
