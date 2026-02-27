
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function debugKernelTurbo() {
    const symbol = 'KERNELUSDT';
    const [k1d, k15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 35),
        fetchBinanceKlines(symbol, '15m', 150)
    ]);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const targetTime = new Date('2026-02-26T01:45:00.000Z').getTime();
    const currentMon = getMonTs(Date.now());
    const prevMon = currentMon - (7 * 24 * 3600);

    const k1dPast = k1d.filter(k => k.time < targetTime);
    let wMax = -Infinity;
    k1dPast.forEach(k => {
        if (getMonTs(k.time) === currentMon) {
            const v = k.quoteVolume / k.volume;
            if (v > wMax) wMax = v;
        }
    });

    let pQ = 0, pB = 0, cQ = 0, cB = 0;
    k1dPast.forEach(k => {
        const km = getMonTs(k.time);
        if (km === prevMon) { pQ += k.quoteVolume; pB += k.volume; }
        else if (km === currentMon) { cQ += k.quoteVolume; cB += k.volume; }
    });
    const pVW = pB > 0 ? pQ / pB : 0;
    const cVW = cB > 0 ? cQ / cB : k1dPast[k1dPast.length - 1].close;

    const candle = k15m.find(k => k.time === targetTime);
    if (!candle) { console.log("Candle not found"); return; }

    const dVwapAtTime = cVW; // Simplification for debug

    console.log(`--- KERNEL TURBO DEBUG ---`);
    console.log(`Price: ${candle.close} | WMax: ${wMax}`);
    console.log(`cVW: ${cVW} | pVW: ${pVW}`);
    console.log(`Cond 1 (cVW > pVW): ${cVW > pVW}`);
    console.log(`Cond 2 (Price > cVW): ${candle.close > cVW}`);
    console.log(`Cond 4 (Turbo: dVwap > cVW): ${dVwapAtTime > cVW} (Wait, dVwap and cVW are related)`);
}
debugKernelTurbo();
