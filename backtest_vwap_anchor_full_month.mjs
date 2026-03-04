
import axios from 'axios';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT', 'ALICEUSDT', 'DENTUSDT', 'PHAUSDT', 'KAVAUSDT', 'JSTUSDT', 'LUNCUSDT'];
const TIMEFRAME_MINS = 15;
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

function calculateAVWAP(klines) {
    if (klines.length === 0) return 0;
    let sumPV = 0;
    let sumV = 0;
    klines.forEach(k => {
        const typicalPrice = (k.high + k.low + k.close) / 3;
        const vol = k.quoteVolume || k.volume;
        sumPV += typicalPrice * vol;
        sumV += vol;
    });
    return sumV > 0 ? sumPV / sumV : 0;
}

async function runBacktest() {
    console.log(`\n🚀 Starting Full Month Backtest (VWAP Anchor Strategy)`);
    console.log(`-----------------------------------------------`);

    let totalTrades = 0;
    let successfulTrades = 0;
    let totalPnL = 0;

    for (const symbol of SYMBOLS) {
        console.log(`\n🔍 Analyzing ${symbol}...`);

        // Fetch Daily Klines for the 1D Filter (30 days)
        const dailyKlines = await fetchBinanceKlines(symbol, '1d', DAYS_TO_TEST);
        // Fetch 1h Klines for higher resolution over 30 days (1m is too much for 30 days in one go)
        // We will simulate the "Sliding" logic using 1h klines to get the general trend.
        const hourlyKlines = await fetchBinanceKlines(symbol, '1h', DAYS_TO_TEST * 24);

        if (dailyKlines.length < 5 || hourlyKlines.length < 24) continue;

        let inPosition = false;
        let entryPrice = 0;
        let symbolPnL = 0;
        let symbolTrades = 0;

        // Iterate through hourly candles
        for (let i = 24; i < hourlyKlines.length; i++) {
            const currentHour = hourlyKlines[i];
            const prevHour = hourlyKlines[i - 1];

            // 1. Find the corresponding Daily VWAP for this time
            const dayStart = new Date(currentHour.time).setUTCHours(0, 0, 0, 0);
            const todayKlines = hourlyKlines.filter(k => k.time >= dayStart && k.time <= currentHour.time);
            const dailyVwap = calculateAVWAP(todayKlines);

            // 2. 1D Filter Check (Price > Daily VWAP)
            const cond1 = currentHour.close > dailyVwap;

            // 3. Sliding AVWAP Logic (Current vs Full Range)
            // Using last 2 hours as the "Long Anchor" and last 1 hour as "Short Anchor"
            const currentShort = calculateAVWAP([currentHour]);
            const currentLong = calculateAVWAP([prevHour, currentHour]);

            const signalLong = cond1 && currentShort > currentLong;
            const signalExit = currentHour.close < dailyVwap || currentShort < currentLong;

            if (!inPosition && signalLong) {
                inPosition = true;
                entryPrice = currentHour.close;
                symbolTrades++;
                totalTrades++;
            } else if (inPosition) {
                const currentPnL = ((currentHour.close - entryPrice) / entryPrice) * 100;
                // SL or TP or Signal Exit
                if (currentPnL <= -3 || currentPnL >= 5 || signalExit) {
                    inPosition = false;
                    symbolPnL += currentPnL;
                    totalPnL += currentPnL;
                    if (currentPnL > 0) successfulTrades++;
                }
            }
        }

        console.log(`   Trades: ${symbolTrades} | PnL: ${symbolPnL.toFixed(2)}%`);
    }

    const winRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    console.log(`\n-----------------------------------------------`);
    console.log(`🏁 FINAL RESULTS (Total Period)`);
    console.log(`-----------------------------------------------`);
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Successful:   ${successfulTrades}`);
    console.log(`Win Rate:     ${winRate.toFixed(2)}%`);
    console.log(`Total PnL:    ${totalPnL.toFixed(2)}%`);
    console.log(`Avg PnL:      ${avgPnL.toFixed(2)}%`);
    console.log(`-----------------------------------------------\n`);
}

runBacktest();
