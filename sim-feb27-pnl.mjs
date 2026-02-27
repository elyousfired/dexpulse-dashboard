
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return null; }
}

async function simulateFeb27() {
    console.log("--- SIMULATING FEB 27 PERFORMANCE (v7+ Turbo + Trailing Stop) ---");
    const now = new Date();
    const startOfTodayTs = Date.UTC(2026, 1, 27, 0, 0, 0);

    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await res.json();
    const candidates = tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 250);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const monTs = getMonTs(Date.now());
    const prevMonTs = monTs - (7 * 24 * 3600);

    // Capital & Slots
    const budget = 1000;
    const slots = 10;
    const slotSize = budget / slots;
    let freeSlots = slots;
    let activeTrades = [];
    let completedTrades = [];

    // Pre-calculate structural data for coins
    const coinDataMap = new Map();
    for (const t of candidates) {
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(t.symbol, '1d', 40),
            fetchBinanceKlines(t.symbol, '15m', 500)
        ]);
        if (!k1d || k1d.length < 20 || !k15m) continue;

        let wMax = -Infinity, wMin = Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
            }
        });

        let pQ = 0, pB = 0, qWeek = 0, bWeek = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) {
                pQ += k.quoteVolume; pB += k.volume;
            } else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                qWeek += k.quoteVolume; bWeek += k.volume;
            }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        coinDataMap.set(t.symbol, { k15m, wMax, wMin, prevWeekVwap, qWeek, bWeek });
    }

    // Step through 15m intervals for all coins today
    const intervals = [];
    for (let i = 0; i < 96; i++) {
        intervals.push(startOfTodayTs + (i * 15 * 60 * 1000));
    }

    for (const time of intervals) {
        // 1. Check existing trades for SL/Trailing
        activeTrades = activeTrades.filter(trade => {
            const data = coinDataMap.get(trade.symbol);
            const k = data.k15m.find(cand => cand.time === time);
            if (!k) return true;

            const high = k.high;
            const low = k.low;
            const close = k.close;

            // Update peak for trailing
            if (high > trade.peak) trade.peak = high;

            // Stop Loss (5%)
            const slPrice = trade.entry * (1 - trade.slLimit);
            if (low <= slPrice) {
                completedTrades.push({ ...trade, exit: slPrice, pnl: -trade.slLimit * 100, reason: "SL" });
                freeSlots++;
                return false;
            }

            // Trailing Stop Logic
            const profitPct = (trade.peak - trade.entry) / trade.entry;
            if (profitPct >= trade.trailingActivation) {
                const trailPrice = trade.peak * (1 - trade.trailingDistance);
                if (low <= trailPrice) {
                    const exitPrice = trailPrice;
                    const finalPnl = ((exitPrice - trade.entry) / trade.entry) * 100;
                    completedTrades.push({ ...trade, exit: exitPrice, pnl: finalPnl, reason: "Trailing" });
                    freeSlots++;
                    return false;
                }
            }
            return true;
        });

        // 2. Scan for new entries
        if (freeSlots > 0) {
            for (const [symbol, data] of coinDataMap) {
                if (activeTrades.find(t => t.symbol === symbol)) continue;
                if (completedTrades.find(t => t.symbol === symbol)) continue; // 1 trade per coin

                const kIdx = data.k15m.findIndex(c => c.time === time);
                if (kIdx <= 0) continue;
                const k = data.k15m[kIdx];
                const prevK = data.k15m[kIdx - 1];

                // Running VWAP
                let qToday = 0, bToday = 0;
                for (let j = 0; j <= kIdx; j++) {
                    if (data.k15m[j].time >= startOfTodayTs) {
                        qToday += data.k15m[j].quoteVolume;
                        bToday += data.k15m[j].volume;
                    }
                }
                const cVW = (data.qWeek + qToday) / (data.bWeek + bToday);
                const volatility = Math.abs(data.wMax - data.wMin) / k.close;

                // v7 check
                if (k.close > data.prevWeekVwap && k.close > cVW && k.close > data.wMax && prevK.close <= data.wMax && cVW > data.prevWeekVwap && volatility > 0.02) {
                    activeTrades.push({
                        symbol,
                        entry: k.close,
                        peak: k.close,
                        timeEntered: new Date(time).toISOString().slice(11, 16),
                        slLimit: 0.05,
                        trailingActivation: 0.03,
                        trailingDistance: 0.02
                    });
                    freeSlots--;
                    if (freeSlots === 0) break;
                }
            }
        }
    }

    // Handle remaining open trades
    activeTrades.forEach(trade => {
        const data = coinDataMap.get(trade.symbol);
        const lastPrice = data.k15m[data.k15m.length - 1].close;
        const pnl = ((lastPrice - trade.entry) / trade.entry) * 100;
        completedTrades.push({ ...trade, exit: lastPrice, pnl, reason: "OPEN" });
    });

    console.log(JSON.stringify(completedTrades, null, 2));
    const netPnl = completedTrades.reduce((sum, t) => sum + (slotSize * (t.pnl / 100)), 0);
    console.log(`\nNET USD PROFIT: $${netPnl.toFixed(2)}`);
}

simulateFeb27();
