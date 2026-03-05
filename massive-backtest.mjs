
import axios from 'axios';

// The full list provided by the user
const rawData = [
    { s: "WBETHUSDT", p: 2281.27, t: "2026-03-05T20:30:54Z" },
    { s: "AAVEUSDT", p: 119.46, t: "2026-03-05T20:30:45Z" },
    { s: "ZENUSDT", p: 5.756, t: "2026-03-05T19:17:00Z" },
    { s: "JUPUSDT", p: 0.189, t: "2026-03-05T19:16:54Z" },
    { s: "RDNTUSDT", p: 0.006, t: "2026-03-05T19:16:12Z" },
    { s: "ONEUSDT", p: 0.002, t: "2026-03-05T18:45:56Z" },
    { s: "ETHFIUSDT", p: 0.538, t: "2026-03-05T18:30:57Z" },
    { s: "THEUSDT", p: 0.267, t: "2026-03-05T18:30:35Z" },
    { s: "WBTCUSDT", p: 70856.96, t: "2026-03-05T18:16:54Z" },
    { s: "AUDIOUSDT", p: 0.02, t: "2026-03-05T17:53:21Z" },
    { s: "EIGENUSDT", p: 0.196, t: "2026-03-05T17:00:56Z" },
    { s: "LINKUSDT", p: 9.19, t: "2026-03-05T16:46:45Z" },
    { s: "1INCHUSDT", p: 0.097, t: "2026-03-05T16:45:47Z" },
    { s: "ALLOUSDT", p: 0.116, t: "2026-03-05T16:45:00Z" },
    { s: "MOVEUSDT", p: 0.022, t: "2026-03-05T16:30:21Z" },
    { s: "ETHUSDT", p: 2086.96, t: "2026-03-05T16:00:41Z" },
    { s: "ENAUSDT", p: 0.116, t: "2026-03-05T15:46:49Z" },
    { s: "WOOUSDT", p: 0.018, t: "2026-03-05T15:46:43Z" },
    { s: "LUMIAUSDT", p: 0.063, t: "2026-03-05T15:46:42Z" },
    { s: "BTCUSDT", p: 71457.5, t: "2026-03-05T15:46:40Z" },
    { s: "MANAUSDT", p: 0.098, t: "2026-03-05T15:46:22Z" },
    { s: "AIUSDT", p: 0.021, t: "2026-03-05T15:45:43Z" },
    { s: "STXUSDT", p: 0.265, t: "2026-03-05T15:45:15Z" },
    { s: "PHBUSDT", p: 0.154, t: "2026-03-05T15:45:07Z" },
    { s: "FORMUSDT", p: 0.353, t: "2026-03-05T13:00:49Z" },
    { s: "ZROUSDT", p: 1.922, t: "2026-03-05T10:46:50Z" },
    { s: "SCRUSDT", p: 0.046, t: "2026-03-05T10:46:03Z" },
    { s: "NEXOUSDT", p: 0.892, t: "2026-03-05T10:31:33Z" },
    { s: "ADXUSDT", p: 0.075, t: "2026-03-05T10:31:31Z" },
    { s: "TAOUSDT", p: 190, t: "2026-03-05T10:30:46Z" },
    { s: "XPLUSDT", p: 0.116, t: "2026-03-05T10:16:49Z" },
    { s: "MORPHOUSDT", p: 1.933, t: "2026-03-05T10:15:04Z" },
    { s: "NILUSDT", p: 0.054, t: "2026-03-05T10:01:37Z" },
    { s: "CVXUSDT", p: 1.938, t: "2026-03-05T10:01:09Z" },
    { s: "BANANAS31USDT", p: 0.006, t: "2026-03-05T10:00:50Z" },
    { s: "STGUSDT", p: 0.17, t: "2026-03-05T10:00:06Z" },
    { s: "OPUSDT", p: 0.13, t: "2026-03-05T09:16:53Z" },
    { s: "CAKEUSDT", p: 1.398, t: "2026-03-05T08:46:56Z" },
    { s: "BNBUSDT", p: 652.47, t: "2026-03-05T08:46:41Z" },
    { s: "SYRUPUSDT", p: 0.24, t: "2026-03-05T08:45:13Z" },
    { s: "RPLUSDT", p: 2.11, t: "2026-03-05T07:00:05Z" },
    { s: "C98USDT", p: 0.027, t: "2026-03-05T06:46:39Z" },
    { s: "AVAXUSDT", p: 9.42, t: "2026-03-05T06:30:46Z" },
    { s: "SUIUSDT", p: 0.951, t: "2026-03-05T06:30:45Z" },
    { s: "MITOUSDT", p: 0.04, t: "2026-03-05T06:30:38Z" },
    { s: "CELOUSDT", p: 0.079, t: "2026-03-05T06:30:03Z" },
    { s: "MASKUSDT", p: 0.451, t: "2026-03-05T06:01:55Z" },
    { s: "KAVAUSDT", p: 0.059, t: "2026-03-05T06:01:05Z" },
    { s: "ETCUSDT", p: 8.71, t: "2026-03-05T06:00:59Z" },
    { s: "FARMUSDT", p: 12.93, t: "2026-03-05T05:02:44Z" },
    { s: "ICPUSDT", p: 2.541, t: "2026-03-05T05:00:52Z" },
    { s: "BNSOLUSDT", p: 99.4, t: "2026-03-05T04:45:25Z" },
    { s: "EPICUSDT", p: 0.3, t: "2026-03-05T04:01:57Z" },
    { s: "PEOPLEUSDT", p: 0.007, t: "2026-03-05T04:01:06Z" },
    { s: "RIFUSDT", p: 0.036, t: "2026-03-05T04:01:04Z" },
    { s: "XRPUSDT", p: 1.42, t: "2026-03-05T04:00:41Z" },
    { s: "SOLUSDT", p: 90.03, t: "2026-03-05T04:00:41Z" },
    { s: "COOKIEUSDT", p: 0.022, t: "2026-03-05T03:31:07Z" },
    { s: "ASTERUSDT", p: 0.716, t: "2026-03-05T03:30:49Z" },
    { s: "BBUSDT", p: 0.027, t: "2026-03-05T03:16:00Z" },
    { s: "AIXBTUSDT", p: 0.03, t: "2026-03-05T03:00:57Z" },
    { s: "PUMPUSDT", p: 0.002, t: "2026-03-05T02:30:49Z" },
    { s: "ILVUSDT", p: 3.65, t: "2026-03-05T02:18:46Z" },
    { s: "BONKUSDT", p: 0.00002, t: "2026-03-05T02:16:58Z" },
    { s: "ONDOUSDT", p: 0.268, t: "2026-03-05T02:16:57Z" },
    { s: "WIFUSDT", p: 0.213, t: "2026-03-05T02:16:55Z" },
    { s: "FILUSDT", p: 1.021, t: "2026-03-05T02:16:54Z" },
    { s: "ZRXUSDT", p: 0.108, t: "2026-03-05T02:16:52Z" },
    { s: "NOTUSDT", p: 0.0005, t: "2026-03-05T02:16:30Z" },
    { s: "LISTAUSDT", p: 0.088, t: "2026-03-05T02:16:14Z" },
    { s: "METISUSDT", p: 3.45, t: "2026-03-05T02:15:37Z" },
    { s: "THETAUSDT", p: 0.198, t: "2026-03-05T02:15:28Z" },
    { s: "SANDUSDT", p: 0.087, t: "2026-03-05T02:15:25Z" },
    { s: "SUSDT", p: 0.042, t: "2026-03-05T02:15:25Z" },
    { s: "CFXUSDT", p: 0.05, t: "2026-03-05T02:15:19Z" },
    { s: "ARKMUSDT", p: 0.11, t: "2026-03-05T02:15:17Z" },
    { s: "RAYUSDT", p: 0.619, t: "2026-03-05T02:15:14Z" },
    { s: "LDOUSDT", p: 0.317, t: "2026-03-05T02:15:12Z" },
    { s: "ARBUSDT", p: 0.105, t: "2026-03-05T01:16:55Z" },
    { s: "HBARUSDT", p: 0.101, t: "2026-03-05T01:16:53Z" },
    { s: "PENDLEUSDT", p: 1.31, t: "2026-03-04T21:45:30Z" },
    { s: "KAVAUSDT", p: 0.059, t: "2026-03-04T21:18:28Z" }
];

async function fetchKlines(symbol, interval, limit) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        return res.data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
        }));
    } catch (e) {
        return null;
    }
}

async function analyzeTrade(symbol, entryPrice, entryTimeStr) {
    const klines = await fetchKlines(symbol, '15m', 500);
    if (!klines) return { status: "ERROR", symbol };

    const entryTime = new Date(entryTimeStr).getTime();
    const entryCandle = klines.find(k => entryTime >= k.time && entryTime < k.time + 15 * 60 * 1000);

    if (!entryCandle) return { status: "ERROR_TIME", symbol };

    // ENTRY Condition: Close > Breakout level
    if (entryCandle.close <= entryPrice) {
        return { symbol, status: "SKIPPED", reason: "Closed below entry level" };
    }

    const actualEntry = entryCandle.close;
    let peak = actualEntry;
    let exit = null;
    let finalPnl = 0;

    const startIdx = klines.indexOf(entryCandle) + 1;
    for (let i = startIdx; i < klines.length; i++) {
        const k = klines[i];
        if (k.close > peak) peak = k.close;

        const pnlNow = (peak - actualEntry) / actualEntry;
        let trail = 0.05;
        if (pnlNow >= 0.30) trail = 0.12;
        else if (pnlNow >= 0.10) trail = 0.07;

        const stop = peak * (1 - trail);
        const hardSL = actualEntry * 0.95;

        if (k.close <= stop || k.close <= hardSL) {
            exit = k.close;
            finalPnl = ((exit - actualEntry) / actualEntry) * 100;
            break;
        }
    }

    return {
        symbol,
        status: "ENTERED",
        entry: actualEntry,
        exit: exit || "OPEN",
        pnl: exit ? finalPnl.toFixed(2) + "%" : "OPEN"
    };
}

async function run() {
    console.log("| Pair | Result | New Entry | New Exit | New PnL | Result |");
    console.log("| :--- | :--- | :--- | :--- | :--- | :--- |");

    let totalPnl = 0;
    let enteredCount = 0;
    let skippedCount = 0;

    for (const t of rawData) {
        const res = await analyzeTrade(t.s, t.p, t.t);

        if (res.status === "ERROR" || res.status === "ERROR_TIME") {
            continue;
        }

        if (res.status === "SKIPPED") {
            console.log(`| ${res.symbol} | 🚫 SKIPPED | - | - | 0.00% | FAKEOUT |`);
            skippedCount++;
        } else {
            const pnlVal = res.pnl === "OPEN" ? 0 : parseFloat(res.pnl);
            console.log(`| ${res.symbol} | ✅ ENTERED | $${res.entry.toLocaleString()} | ${res.exit === "OPEN" ? "OPEN" : "$" + res.exit.toLocaleString()} | ${res.pnl} | ${pnlVal >= 0 ? 'WON' : 'LOST'} |`);
            if (res.pnl !== "OPEN") {
                totalPnl += pnlVal;
                enteredCount++;
            }
        }
        // Small delay to prevent rate limit
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n### Summary of 15m Close Strategy:`);
    console.log(`- **Total Analyzed**: ${rawData.length}`);
    console.log(`- **Fakeouts Avoided (Skipped)**: ${skippedCount}`);
    console.log(`- **Confirmed Entries**: ${enteredCount}`);
    console.log(`- **Aggregate Net PnL**: ${totalPnl.toFixed(2)}%`);
}

run();
