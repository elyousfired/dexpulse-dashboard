
async function checkDotHistory() {
    const symbol = 'DOTUSDT';
    const wMax = 1.27;

    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=10`;
        const res = await fetch(url);
        const data = await res.json();

        console.log(`--- DOT HISTORICAL BREAKOUT SEARCH ---`);
        for (const d of data) {
            const date = new Date(d[0]).toISOString().split('T')[0];
            const close = parseFloat(d[4]);
            if (close > wMax) {
                console.log(`[ABOVE] Date: ${date} | Close: $${close}`);
            } else {
                console.log(`[BELOW] Date: ${date} | Close: $${close}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

checkDotHistory();
