
import axios from 'axios';

async function auditFailures() {
    console.log("--- 🕵️ AUDIT DES ÉCHECS (Failures Audit) ---");
    console.log("Période: 23 Fév - 28 Fév 2026");
    console.log("Critère: Golden Signal (v7) | Stop Loss: -5%\n");

    const { data: tickers } = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
    const symbols = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 100) // Audit top 100 pairs
        .map(t => t.symbol);

    let totalSignals = 0;
    let successfulOnes = 0;
    let failedOnes = 0;
    const failures = [];

    const startTs = new Date('2026-02-23T00:00:00Z').getTime();

    for (const sym of symbols) {
        try {
            const { data: klines } = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=500`);

            // Simplified Golden Check for audit
            // In a real scan we use 15m VWAP, here we use Hourly volatility as a proxy
            for (let i = 10; i < klines.length; i++) {
                const k = klines[i];
                if (k[0] < startTs) continue;

                const close = parseFloat(k[4]);
                const high = parseFloat(k[2]);
                const vol = parseFloat(k[5]);

                // Breakout logic: Change > 3% on high volume after consolidation
                const prevClose = parseFloat(klines[i - 1][4]);
                const change = (close - prevClose) / prevClose;

                if (change > 0.04) { // Proxy for Golden Signal (Strong 4% move)
                    totalSignals++;
                    const entryPrice = close;
                    let hitSL = false;
                    let maxProfit = 0;

                    // Track next 24 hours
                    for (let j = i + 1; j < Math.min(i + 24, klines.length); j++) {
                        const nextLow = parseFloat(klines[j][3]);
                        const nextHigh = parseFloat(klines[j][2]);
                        const pnl = ((nextHigh - entryPrice) / entryPrice) * 100;
                        if (pnl > maxProfit) maxProfit = pnl;

                        if (nextLow <= entryPrice * 0.95) {
                            hitSL = true;
                            break;
                        }
                    }

                    if (hitSL && maxProfit < 3) { // Failed if hit -5% SL and never saw >3% profit
                        failedOnes++;
                        failures.push({ symbol: sym, entry: entryPrice, max: maxProfit.toFixed(2) });
                        break; // Only count first signal per token for audit simplicity
                    } else if (maxProfit > 5) {
                        successfulOnes++;
                        break;
                    }
                }
            }
        } catch (e) { }
    }

    console.log(`Résultats sur 100 tokens testés:`);
    console.log(`✅ Succès (Hits): ${successfulOnes}`);
    console.log(`❌ Échecs (Misses/SL): ${failedOnes}`);
    console.log(`📉 Win Rate: ${((successfulOnes / (successfulOnes + failedOnes)) * 100).toFixed(1)}%`);
    console.log(`\nListe des échecs notables:`);
    failures.slice(0, 10).forEach(f => console.log(`- ${f.symbol}: Entrée à $${f.entry}, Max profit ${f.max}% -> Hit -5% SL`));
}

auditFailures();
