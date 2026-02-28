
import axios from 'axios';

async function checkSymbol(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=15m&limit=100`;
        const { data: klines15m } = await axios.get(url);

        const klines = klines15m.map(k => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));

        const last = klines[klines.length - 1];
        const prev = klines[klines.length - 2];

        console.log(`Symbol: ${symbol}USDT`);
        console.log(`Last Close: ${last.close}`);
        console.log(`Prev Close: ${prev.close}`);

        // Let's get weekly vwap
        const resVwap = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1w&limit=2`);
        console.log('Weekly data found.');
    } catch (e) {
        console.log(`Error checking ${symbol}: ${e.message}`);
    }
}

checkSymbol('SAHARA');
checkSymbol('SAH');
