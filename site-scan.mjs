
async function siteScan() {
    console.log("--- SITE-FILTERED GOLDEN SCAN (v7) ---");
    console.log("Filters: >500k Vol, Top 150 Tickers, USDT pairs");

    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const tickers = await response.json();

        const filtered = tickers
            .filter(t => t.symbol.endsWith('USDT'))
            .filter(t => parseFloat(t.quoteVolume) > 500000)
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 150);

        console.log(`Scanning ${filtered.length} candidates...`);

        const results = filtered.map(t => t.symbol);

        console.log("Top Volume Tokens meeting Site Filters:");
        console.log(results.slice(0, 20).join(", ") + "...");
    } catch (e) {
        console.error(e);
    }
}

siteScan();
