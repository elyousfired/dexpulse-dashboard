
async function checkDotStatus() {
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=DOTUSDT');
        const ticker = await res.json();
        console.log(`DOT Price: $${ticker.lastPrice}`);
        console.log(`DOT Volume: $${(parseFloat(ticker.quoteVolume) / 1000000).toFixed(2)}M`);

        const res2 = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const all = await res2.json();
        const usdt = all.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
        const rank = usdt.findIndex(t => t.symbol === 'DOTUSDT') + 1;
        console.log(`DOT Rank by Volume: ${rank}`);
    } catch (e) {
        console.error(e);
    }
}
checkDotStatus();
