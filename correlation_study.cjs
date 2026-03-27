const fs = require('fs');
const axios = require('axios');

async function analyze() {
    const huntsFile = 'c:\\Users\\REDOUAN\\Downloads\\dexpulse-boosted-dashboard\\server\\data\\active_hunts.json';
    const data = JSON.parse(fs.readFileSync(huntsFile, 'utf8'));
    const tslTrades = data.filter(h => h.strategyId === 'vwap_tsl');

    const losers = tslTrades.filter(h => h.status === 'closed' && h.pnl < 0);
    const winners = tslTrades.filter(h => h.status === 'closed' && h.pnl > 5); // Big winners

    console.log('--- CORRELATION SEARCH ---');

    const results = [];

    for (const group of [{ name: 'LOSERS', trades: losers }, { name: 'WINNERS', trades: winners }]) {
        console.log(`\nAnalyzing ${group.name}...`);
        for (const trade of group.trades) {
            try {
                // Fetch current volume as a proxy for liquidity
                const tickerRes = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${trade.symbol}`);
                const vol24h = parseFloat(tickerRes.data.quoteVolume);
                
                results.push({
                    group: group.name,
                    symbol: trade.symbol,
                    pnl: trade.pnl,
                    density: trade.density,
                    vol24h: vol24h,
                    entryDistance: trade.entryDistance,
                    entryRsi: trade.entryRsi
                });

                console.log(`${trade.symbol} | PnL: ${trade.pnl?.toFixed(2)}% | Density: ${trade.density}% | Vol24h: $${(vol24h / 1e6).toFixed(2)}M`);
                
                // Rate limit protection
                await new Promise(r => setTimeout(r, 100));
            } catch (e) {
                console.log(`Failed to fetch info for ${trade.symbol}: ${e.message}`);
            }
        }
    }

    fs.writeFileSync('c:\\Users\\REDOUAN\\Downloads\\dexpulse-boosted-dashboard\\correlation_data.json', JSON.stringify(results, null, 2));
}

analyze();
