
import fetch from 'node-fetch';

async function analyzeGoldens() {
    console.log("--- FULL MARKET GOLDEN SCAN (v7) ---");

    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const tickers = await response.json();

        const allUsdt = tickers.filter(t => t.symbol.endsWith('USDT'));
        console.log(`Total USDT pairs: ${allUsdt.length}`);

        // Let's identify who triggered today vs current status
    } catch (e) {
        console.error(e);
    }
}

analyzeGoldens();
