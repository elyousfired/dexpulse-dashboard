
async function checkSpecifics() {
    console.log("--- CHECKING TODAY'S ALERTED TOKENS ---");
    const targets = ["FOGO", "DCR", "DEXE"];

    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const tickers = await response.json();

        const usdtTickers = tickers
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

        targets.forEach(symbol => {
            const pair = symbol + "USDT";
            const ticker = usdtTickers.find(t => t.symbol === pair);
            const rank = usdtTickers.indexOf(ticker) + 1;

            if (ticker) {
                console.log(`${symbol}:`);
                console.log(`  Volume: $${(parseFloat(ticker.quoteVolume) / 1000).toFixed(2)}K`);
                console.log(`  Rank by Vol: ${rank}`);
                console.log(`  Meets Site Filter (>500k & Top 150): ${parseFloat(ticker.quoteVolume) > 500000 && rank <= 150}`);
            } else {
                console.log(`${symbol}: Not found on Binance USDT spot.`);
            }
        });
    } catch (e) {
        console.error(e);
    }
}

checkSpecifics();
