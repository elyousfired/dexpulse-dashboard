
async function fetchLatestPrice(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
        const res = await fetch(url);
        const data = await res.json();
        return parseFloat(data.price);
    } catch (e) { return null; }
}

async function monitorOpenTrades() {
    const openTrades = [
        { symbol: 'WLDUSDT', entry: 0.4114 },
        { symbol: 'ETHFIUSDT', entry: 0.5210 },
        { symbol: 'MORPHOUSDT', entry: 1.8590 },
        { symbol: 'SOMIUSDT', entry: 0.2288 },
        { symbol: 'GUNUSDT', entry: 0.0312 },
        { symbol: 'JSTUSDT', entry: 0.0381 }
    ];

    console.log("--- REAL-TIME MONITORING OF OPEN TRADES ---");
    console.log("| Symbol | Entry | Current | PnL % | Status |");
    console.log("| :--- | :--- | :--- | :--- | :--- |");

    for (const trade of openTrades) {
        const current = await fetchLatestPrice(trade.symbol);
        if (current) {
            const pnl = ((current - trade.entry) / trade.entry) * 100;
            let status = "HOLDING ⏳";
            if (pnl >= 3) status = "TURBO ACTIVE 🔥";
            if (pnl <= -4) status = "RISK ZONE ⚠️";
            console.log(`| ${trade.symbol} | $${trade.entry.toFixed(4)} | $${current.toFixed(4)} | ${pnl.toFixed(2)}% | ${status} |`);
        }
    }
}

monitorOpenTrades();
