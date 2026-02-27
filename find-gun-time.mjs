
async function findExactTime() {
    const symbol = 'GUNUSDT';
    const wMax = 0.0309;

    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=20`;
        const res = await fetch(url);
        const data = await res.json();

        console.log(`--- ANALYZING ${symbol} BREAKOUT ---`);
        console.log(`Weekly Max Level: $${wMax}`);

        for (const d of data) {
            const time = new Date(d[0]);
            const close = parseFloat(d[4]);
            const open = parseFloat(d[1]);

            if (close > wMax && parseFloat(d[1]) <= wMax) {
                console.log(`[MATCH] Breakout Candle: ${time.toISOString()} | Close: $${close}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

findExactTime();
