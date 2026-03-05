import axios from 'axios';

async function fetchKlines(symbol, interval, limit) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    try {
        const res = await axios.get(url);
        return res.data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
        }));
    } catch (e) { return []; }
}

async function analyzeTrade(symbol, entryPrice, entryTimeStr) {
    const klines = await fetchKlines(symbol, '15m', 100);
    if (klines.length === 0) return null;

    const entryTime = new Date(entryTimeStr).getTime();

    // Find the candle that includes the entry time
    const entryCandle = klines.find(k => entryTime >= k.time && entryTime < k.time + 15 * 60 * 1000);

    if (!entryCandle) return "Time not found in history";

    // 1. Check Entry Confirmation (Close > Breakout/Entry price)
    const confirmedEntry = entryCandle.close > entryPrice;
    if (!confirmedEntry) {
        return { symbol, status: "SKIPPED", reason: `Candle closed at $${entryCandle.close} (below $${entryPrice})` };
    }

    const actualEntryPrice = entryCandle.close;
    let peak = actualEntryPrice;
    let exitPrice = null;

    // 2. Simulate Exit (Trailing 5% - 12% on Close price)
    const startIdx = klines.indexOf(entryCandle) + 1;
    for (let i = startIdx; i < klines.length; i++) {
        const k = klines[i];
        if (k.close > peak) peak = k.close;

        const currentPnl = (peak - actualEntryPrice) / actualEntryPrice;
        let trailDist = 0.05;
        if (currentPnl >= 0.3) trailDist = 0.12;
        else if (currentPnl >= 0.1) trailDist = 0.07;

        const stopLevel = peak * (1 - trailDist);
        const hardStop = actualEntryPrice * 0.95;

        if (k.close <= stopLevel || k.close <= hardStop) {
            exitPrice = k.close;
            break;
        }
    }

    const pnl = exitPrice ? ((exitPrice - actualEntryPrice) / actualEntryPrice * 100) : null;

    return {
        symbol,
        status: "ENTERED",
        entry: actualEntryPrice,
        peak,
        exit: exitPrice,
        pnl: pnl ? pnl.toFixed(2) + "%" : "STILL OPEN"
    };
}

async function run() {
    const trades = [
        { s: "WBETHUSDT", p: 2281.27, t: "2026-03-05T20:30:54Z" },
        { s: "AAVEUSDT", p: 119.46, t: "2026-03-05T20:30:45Z" },
        { s: "ZENUSDT", p: 5.756, t: "2026-03-05T19:17:00Z" },
        { s: "JUPUSDT", p: 0.189, t: "2026-03-05T19:16:54Z" },
        { s: "RDNTUSDT", p: 0.006, t: "2026-03-05T19:16:12Z" },
        { s: "ONEUSDT", p: 0.002, t: "2026-03-05T18:45:56Z" },
        { s: "ETHFIUSDT", p: 0.538, t: "2026-03-05T18:30:57Z" },
        { s: "THEUSDT", p: 0.267, t: "2026-03-05T18:30:35Z" },
        { s: "AUDIOUSDT", p: 0.02, t: "2026-03-05T17:53:21Z" },
        { s: "FORMUSDT", p: 0.353, t: "2026-03-05T13:00:49Z" },
        { s: "ZROUSDT", p: 1.922, t: "2026-03-05T10:46:50Z" },
        { s: "ADXUSDT", p: 0.075, t: "2026-03-05T10:31:31Z" },
        { s: "NILUSDT", p: 0.054, t: "2026-03-05T10:01:37Z" }
    ];

    console.log("| Symbol | Verdict | Entry (Close) | PnL (New Logics) | Reason / Status |");
    console.log("| :--- | :--- | :--- | :--- | :--- |");

    for (const t of trades) {
        const res = await analyzeTrade(t.s, t.p, t.t);
        if (typeof res === 'string') {
            console.log(`| ${t.s} | ERROR | - | - | ${res} |`);
        } else if (res.status === "SKIPPED") {
            console.log(`| ${t.s} | 🚫 SKIPPED | - | 0.00% | ${res.reason} |`);
        } else {
            console.log(`| ${t.s} | ✅ ENTERED | $${res.entry} | ${res.pnl} | ${res.pnl === "STILL OPEN" ? "Tracking..." : "Closed"} |`);
        }
    }
}

run();
