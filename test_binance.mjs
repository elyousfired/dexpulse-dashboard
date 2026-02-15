
async function test() {
    const symbol = 'BTCUSDT';
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=14`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log('BTC Klines:', data.length);
        if (data.length > 0) {
            console.log('Sample:', data[0]);
        }
    } catch (e) {
        console.error('Fetch failed:', e.message);
    }
}
test();
