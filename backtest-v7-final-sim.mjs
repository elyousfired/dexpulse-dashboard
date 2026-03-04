
import axios from 'axios';

// Expanded list of high-volume symbols for realistic simulation
const SYMBOLS_COUNT = 50;
const DAYS_TO_TEST = 30;

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

const getRolling3DayBounds = (currentTs, k1d) => {
    // Looks back at last 3 daily candles to find structural Max/Min
    const threeDaysAgo = currentTs - (3 * 24 * 3600 * 1000);
    let max = -Infinity, min = Infinity;
    k1d.forEach(dk => {
        if (dk.time >= threeDaysAgo && dk.time < currentTs - (24 * 3600 * 1000)) {
            const vwap = dk.quoteVolume / dk.volume;
            if (vwap > max) max = vwap;
            if (vwap < min) min = vwap;
        }
    });
    return { max, min };
};

async function runV7FullSimulation() {
    console.log(`\n🚀 Starting REALISTIC V7 Simulation (30 Days)`);
    console.log(`📊 Strategy: V7 + Weekend Data Inclusion (Rolling 3D)`);
    console.log(`------------------------------------------------------------------`);

    // Fetch top symbols by volume
    const tickerRes = await axios.get('https://data-api.binance.vision/api/v3/ticker/24hr');
    const candidates = tickerRes.data
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, SYMBOLS_COUNT)
        .map(t => t.symbol);

    let grandTotalPnL = 0;
    let totalTrades = 0;
    let successfulTrades = 0;
    let maxPotentialTotal = 0;

    for (const symbol of candidates) {
        process.stdout.write(`⏳ Analyzing ${symbol}... `);

        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(symbol, '1d', 45),
            fetchBinanceKlines(symbol, '15m', DAYS_TO_TEST * 96)
        ]);

        if (k1d.length < 20 || k15m.length < 100) {
            console.log("Skipped (Data)");
            continue;
        }

        let symbolPnL = 0;
        let symbolTrades = 0;
        let inPos = false, entry = 0, peak = 0, currentSL = 0;

        for (let i = 1; i < k15m.length; i++) {
            const currentK = k15m[i];
            const prevK = k15m[i - 1];
            const nowTs = currentK.time;

            // v7 Context Calculation
            const mondayTs = getMonTs(nowTs);
            const prevMondayTs = mondayTs - (7 * 24 * 3600);
            const dayOfWeek = new Date(nowTs).getUTCDay(); // 1=Mon, 2=Tue

            let wMax = -Infinity, wMin = Infinity;
            let prevWeekQ = 0, prevWeekV = 0, currWeekQ = 0, currWeekV = 0;

            // Rolling 3-Day for Monday/Tuesday, Weekly for others
            if (dayOfWeek === 1 || dayOfWeek === 2) {
                const bounds = getRolling3DayBounds(nowTs, k1d);
                wMax = bounds.max;
                wMin = bounds.min;
            } else {
                k1d.forEach(dk => {
                    const dkMon = getMonTs(dk.time);
                    const dVwap = dk.quoteVolume / dk.volume;
                    if (dkMon === mondayTs && dk.time < nowTs - (24 * 3600 * 1000)) {
                        if (dVwap > wMax) wMax = dVwap;
                        if (dVwap < wMin) wMin = dVwap;
                    }
                });
            }

            // Weekly VWAP logic
            k1d.forEach(dk => {
                const dkMon = getMonTs(dk.time);
                if (dkMon === prevMondayTs) { prevWeekQ += dk.quoteVolume; prevWeekV += dk.volume; }
                else if (dkMon === mondayTs && dk.time <= nowTs) { currWeekQ += dk.quoteVolume; currWeekV += dk.volume; }
            });

            const pWV = prevWeekV > 0 ? prevWeekQ / prevWeekV : 0;
            const cWV = currWeekV > 0 ? currWeekQ / currWeekV : currentK.close;
            if (wMax === -Infinity) wMax = currentK.close;
            if (wMin === Infinity) wMin = currentK.close;

            const volHurdle = (wMax - wMin) / currentK.close;
            const isGolden =
                currentK.close > pWV &&
                currentK.close > cWV &&
                currentK.close > wMax &&
                pWV > 0 &&
                volHurdle > 0.02 &&
                currentK.close > wMax && prevK.close <= wMax;

            if (!inPos && isGolden) {
                inPos = true; entry = currentK.close; peak = currentK.close;
                currentSL = entry * 0.95;
                symbolTrades++; totalTrades++;
            } else if (inPos) {
                if (currentK.high > peak) peak = currentK.high;

                const gain = ((peak - entry) / entry) * 100;
                if (gain >= 20) currentSL = peak * 0.90;
                else if (gain >= 10) currentSL = peak * 0.93;
                else if (gain >= 5) currentSL = entry;

                if (currentK.low <= currentSL || currentK.close < wMax * 0.98) {
                    inPos = false;
                    const result = ((currentSL - entry) / entry) * 100;
                    symbolPnL += result; grandTotalPnL += result;
                    maxPotentialTotal += ((peak - entry) / entry) * 100;
                    if (result > 0) successfulTrades++;
                }
            }
        }
        console.log(`PnL: ${symbolPnL.toFixed(2)}% (${symbolTrades} trades)`);
    }

    console.log(`\n------------------------------------------------------------------`);
    console.log(`🏁 REALISTIC V7 FINAL RESULTS (30 DAYS)`);
    console.log(`------------------------------------------------------------------`);
    console.log(`Total Trades:    ${totalTrades}`);
    console.log(`Win Rate:        ${((successfulTrades / totalTrades) * 100).toFixed(2)}%`);
    console.log(`Total PnL (SL):  ${grandTotalPnL.toFixed(2)}%`);
    console.log(`Avg Gain/Trade:  ${(grandTotalPnL / totalTrades).toFixed(2)}%`);
    console.log(`Max Potential:   +${maxPotentialTotal.toFixed(2)}% (Cumulative Move)`);
    console.log(`------------------------------------------------------------------\n`);
}

runV7FullSimulation();
