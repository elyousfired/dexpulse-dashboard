
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            close: parseFloat(d[4]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return []; }
}

async function runCapitalAnalysis() {
    const startTs = Date.UTC(2026, 1, 24, 0, 0, 0);
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 100);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const activeTrades = [];

    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 40),
            fetchBinanceKlines(t.symbol, '15m', 500)
        ]);
        if (k1d.length < 20 || k15m.length < 100) continue;

        let hasTraded = false;
        k15m.forEach((k, idx) => {
            if (k.time < startTs || idx === 0 || hasTraded) return;
            const targetTime = k.time;
            const k1dPast = k1d.filter(d => d.time < targetTime);
            if (k1dPast.length < 15) return;
            const curMon = getMonTs(targetTime);
            const prevMon = curMon - (7 * 24 * 3600);
            let pQ = 0, pB = 0, cQ = 0, cB = 0, wMax = -Infinity;
            k1dPast.forEach(d => {
                const km = getMonTs(d.time);
                if (km === prevMon) { pQ += d.quoteVolume; pB += d.volume; }
                else if (km === curMon) {
                    cQ += d.quoteVolume; cB += d.volume;
                    const v = d.quoteVolume / d.volume;
                    if (v > wMax) wMax = v;
                }
            });
            const pVW = pB > 0 ? pQ / pB : 0;
            const cVW = cB > 0 ? cQ / cB : k1dPast[k1dPast.length - 1].close;

            if (cVW > pVW && k.close > cVW && k15m[idx - 1].close <= cVW && (Math.abs(wMax - cVW) / k.close) > 0.02) {
                hasTraded = true;
                let entryTs = k.time;
                let exitTs = k15m[k15m.length - 1].time; // default
                let maxP = k.close;
                let trailActive = false;
                for (let j = idx + 1; j < k15m.length; j++) {
                    const l = k15m[j].low, h = k15m[j].high, c = k15m[j].close;
                    if (h > maxP) maxP = h;
                    if (((maxP - entryTs) / entryTs) >= 3) trailActive = true;
                    if (trailActive) {
                        if (((maxP - c) / maxP) * 100 >= 2) { exitTs = k15m[j].time; break; }
                    } else if (((l - k.close) / k.close) * 100 <= -5) {
                        exitTs = k15m[j].time; break;
                    }
                }
                activeTrades.push({ start: entryTs, end: exitTs });
            }
        });
    }

    // Peak calculation
    let maxConcurrent = 0;
    const allEvents = [];
    activeTrades.forEach(t => {
        allEvents.push({ t: t.start, type: 1 });
        allEvents.push({ t: t.end, type: -1 });
    });
    allEvents.sort((a, b) => a.t - b.t || a.type - b.type);
    let current = 0;
    allEvents.forEach(e => {
        current += e.type;
        if (current > maxConcurrent) maxConcurrent = current;
    });

    console.log(`Peak Concurrent Trades: ${maxConcurrent}`);
}
runCapitalAnalysis();
