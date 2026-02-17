function calculateAVWAP(klines) {
    if (klines.length === 0) return { vwap: 0 };
    let sumPV = 0;
    let sumV = 0;
    klines.forEach(k => {
        const typicalPrice = (k.high + k.low + k.close) / 3;
        const vol = k.quoteVolume || k.volume;
        sumPV += typicalPrice * vol;
        sumV += vol;
    });
    return { vwap: sumV > 0 ? sumPV / sumV : 0 };
}

const mockKlines = [
    { time: 1000, open: 100, high: 110, low: 90, close: 105, volume: 10, quoteVolume: 1000 },
    { time: 2000, open: 105, high: 115, low: 100, close: 110, volume: 15, quoteVolume: 1600 },
];

const result = calculateAVWAP(mockKlines);
console.log('Test result:', result);

if (Math.abs(result.vwap - 105.76) < 0.1) {
    console.log('✅ Logic verified');
} else {
    console.log('❌ Logic error');
}
