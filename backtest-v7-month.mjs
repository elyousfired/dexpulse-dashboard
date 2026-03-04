
import axios from 'axios';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT', 'ALICEUSDT', 'DENTUSDT', 'PHAUSDT', 'KAVAUSDT', 'JSTUSDT', 'LUNCUSDT', 'VIRTUALUSDT', 'DOTUSDT'];
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
    } catch (err) {
        return [];
    }
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

async function runBacktest() {
    console.log(`\n🚀 Starting FULL MONTH Backtest (V7 Strategy: 6-Point Check + Tiers)`);
    console.log(`------------------------------------------------------------------`);

    let totalTrades = 0;
    let successfulTrades = 0;
    let grandTotalPnL = 0;

    for (const symbol of SYMBOLS) {
        console.log(`\n🔍 Analyzing ${symbol}...`);

        // Fetch Daily Klines for VWAP Max/Min (35 days to cover month shift)
        const k1d = await fetchBinanceKlines(symbol, '1d', DAYS_TO_TEST + 7);
        // Fetch 15m Klines for signals (30 days * 96 candles/day)
        const k15m = await fetchBinanceKlines(symbol, '15m', DAYS_TO_TEST * 96);

        if (k1d.length < 15 || k15m.length < 100) continue;

        let symbolPnL = 0;
        let symbolTrades = 0;
        let inPosition = false;
        let entryPrice = 0;
        let peakPrice = 0;
        let currentSL = 0;

        for (let i = 1; i < k15m.length; i++) {
            const currentK = k15m[i];
            const prevK = k15m[i - 1];

            // 1. Calculate v7 Context (VWAP Max/Min/Weekly)
            const nowTs = currentK.time;
            const mondayTs = getMonTs(nowTs);
            const prevMondayTs = mondayTs - (7 * 24 * 3600);

            let wMax = -Infinity, wMin = Infinity;
            let currentDayVwap = 0;
            let prevWeekQ = 0, prevWeekV = 0, currWeekQ = 0, currWeekV = 0;

            k1d.forEach((dk, idx) => {
                const dkMon = getMonTs(dk.time);
                const dailyVwap = dk.volume > 0 ? dk.quoteVolume / dk.volume : dk.close;

                // Max/Min from COMPLETED days this week
                if (dkMon === mondayTs && dk.time < nowTs - (24 * 3600 * 1000)) {
                    if (dailyVwap > wMax) wMax = dailyVwap;
                    if (dailyVwap < wMin) wMin = dailyVwap;
                }

                // Weekly aggregates
                if (dkMon === prevMondayTs) { prevWeekQ += dk.quoteVolume; prevWeekV += dk.volume; }
                else if (dkMon === mondayTs && dk.time <= nowTs) { currWeekQ += dk.quoteVolume; currWeekV += dk.volume; }

                if (dk.time <= nowTs && dk.time + (24 * 3600 * 1000) > nowTs) currentDayVwap = dailyVwap;
            });

            const prevWeekVwap = prevWeekV > 0 ? prevWeekQ / prevWeekV : 0;
            const currentWeekVwap = currWeekV > 0 ? currWeekQ / currWeekV : currentDayVwap;
            if (wMax === -Infinity) wMax = currentDayVwap;
            if (wMin === Infinity) wMin = currentDayVwap;

            // v7 Entry Logic
            const volatility = Math.abs(wMax - wMin) / currentK.close;
            const isGolden =
                currentK.close > prevWeekVwap &&
                currentK.close > currentWeekVwap &&
                currentK.close > wMax &&
                currentWeekVwap > prevWeekVwap && prevWeekVwap > 0 &&
                volatility > 0.02 &&
                currentK.close > wMax && prevK.close <= wMax;

            if (!inPosition && isGolden) {
                inPosition = true;
                entryPrice = currentK.close;
                peakPrice = currentK.close;
                currentSL = entryPrice * 0.95; // Initial -5% SL
                symbolTrades++;
                totalTrades++;
            } else if (inPosition) {
                // Update Peak
                if (currentK.high > peakPrice) peakPrice = currentK.high;

                // Tiers Logic
                const gain = ((peakPrice - entryPrice) / entryPrice) * 100;
                if (gain >= 20) currentSL = peakPrice * 0.90; // Tier 3 (-10% from peak)
                else if (gain >= 10) currentSL = peakPrice * 0.93; // Tier 2 (-7% from peak)
                else if (gain >= 5) currentSL = entryPrice; // Tier 1 (Break even)

                // Check SL hit
                if (currentK.low <= currentSL) {
                    inPosition = false;
                    const finalPnL = ((currentSL - entryPrice) / entryPrice) * 100;
                    symbolPnL += finalPnL;
                    grandTotalPnL += finalPnL;
                    if (finalPnL > 0) successfulTrades++;
                }
            }
        }
        console.log(`   Trades: ${symbolTrades} | PnL: ${symbolPnL.toFixed(2)}%`);
    }

    const winRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;
    const avgPnL = totalTrades > 0 ? grandTotalPnL / totalTrades : 0;

    console.log(`\n------------------------------------------------------------------`);
    console.log(`🏁 V7 FINAL RESULTS (30 DAYS)`);
    console.log(`------------------------------------------------------------------`);
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Successful:   ${successfulTrades}`);
    console.log(`Win Rate:     ${winRate.toFixed(2)}%`);
    console.log(`Total PnL:    ${grandTotalPnL.toFixed(2)}%`);
    console.log(`Avg PnL:      ${avgPnL.toFixed(2)}%`);
    console.log(`------------------------------------------------------------------\n`);
}

runBacktest();
