const fs = require('fs');
const axios = require('axios');

async function checkBTC() {
    const huntsFile = 'c:\\Users\\REDOUAN\\Downloads\\dexpulse-boosted-dashboard\\server\\data\\active_hunts.json';
    const data = JSON.parse(fs.readFileSync(huntsFile, 'utf8'));
    const tslTrades = data.filter(h => h.strategyId === 'vwap_tsl');
    const losers = tslTrades.filter(h => h.status === 'closed' && h.pnl < 0);

    console.log('--- BTC CORRELATION AUDIT ---');

    // Fetch BTC 15m klines for the last 48h
    const btcRes = await axios.get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=200');
    const btcKlines = btcRes.data.map(d => ({
        time: d[0],
        open: parseFloat(d[1]),
        close: parseFloat(d[4]),
        isRed: parseFloat(d[4]) < parseFloat(d[1])
    }));

    for (const trade of losers) {
        const entryTime = new Date(trade.entryTime).getTime();
        const btcCandle = btcKlines.find(k => k.time <= entryTime && k.time + 15*60*1000 > entryTime);
        
        if (btcCandle) {
            console.log(`${trade.symbol} | Entry: ${trade.entryTime} | BTC Red: ${btcCandle.isRed} | BTC PnL 15m: ${((btcCandle.close - btcCandle.open)/btcCandle.open*100).toFixed(2)}%`);
        }
    }
}

checkBTC();
