import axios from 'axios';

async function fetchBinanceKlines(symbol, interval, limit) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    try {
        const res = await axios.get(url);
        return res.data.map(d => ({
            time: Math.floor(d[0] / 1000),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

function getMonTs(ts) {
    const d = new Date(ts * 1000);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const mon = new Date(ts * 1000);
    mon.setUTCHours(0, 0, 0, 0);
    mon.setUTCDate(mon.getUTCDate() - diff);
    return Math.floor(mon.getTime() / 1000);
}

async function debugToken(symbol) {
    // Check Volume Rank
    const tickersRes = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = tickersRes.data
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

    const rank = tickers.findIndex(t => t.symbol === symbol) + 1;
    const ticker = tickers.find(t => t.symbol === symbol);

    console.log(`DEBUG: ${symbol}`);
    console.log(`- Volume Rank: ${rank} / ${tickers.length}`);
    if (ticker) console.log(`- 24h Quote Volume: $${parseFloat(ticker.quoteVolume).toLocaleString()}`);

    const [klines, klines15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 30),
        fetchBinanceKlines(symbol, '15m', 20) // Get more candles
    ]);

    if (klines.length < 15 || klines15m.length < 2) {
        console.log("Not enough history for", symbol);
        return;
    }

    const nowTs = Math.floor(Date.now() / 1000);
    const mondayTs = getMonTs(nowTs);

    let wMax = -Infinity;
    const rawVwap = klines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    klines.forEach((k, index) => {
        const dailyVwap = rawVwap[index];
        const isCompletedDay = index < klines.length - 1;
        const kMonTs = getMonTs(k.time);
        if (kMonTs === mondayTs && isCompletedDay) {
            if (dailyVwap > wMax) wMax = dailyVwap;
        }
    });

    console.log(`- Weekly Max (Mon-Thu): ${wMax}`);
    console.log(`- Recent 15m Candles (Close vs Max):`);

    for (let i = 1; i < klines15m.length; i++) {
        const cur = klines15m[i];
        const prev = klines15m[i - 1];
        const cross = cur.close > wMax && prev.close <= wMax;
        const time = new Date(cur.time * 1000).toISOString();
        console.log(`  [${time}] Close: ${cur.close} | Cross: ${cross}`);
    }
}

debugToken('SIGNUSDT');
