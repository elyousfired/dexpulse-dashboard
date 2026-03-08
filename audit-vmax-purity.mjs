import fs from 'fs';
import path from 'path';
import axios from 'axios';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

async function fetchHistoricalKlines(symbol, endTime) {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    // We need daily klines before the entryTime to calculate Weekly VMAX
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=30&endTime=${endTime}`;
    try {
        const res = await axios.get(url);
        return res.data.map(d => ({
            time: d[0],
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7]),
            close: parseFloat(d[4])
        }));
    } catch (err) { return []; }
}

function calculateHistoricalVmax(klines, entryTime) {
    const d = new Date(entryTime);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const monday = new Date(entryTime);
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - diff);
    const mondayTs = monday.getTime();

    let wMax = -Infinity;
    const rawVwap = klines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    klines.forEach((k, index) => {
        // Only daily klines that belong to the SAME week as the entryTime
        // and are BEFORE the entryTime
        if (k.time >= mondayTs && k.time < entryTime) {
            const dailyVwap = rawVwap[index];
            if (dailyVwap > wMax) wMax = dailyVwap;
        }
    });

    return wMax === -Infinity ? null : wMax;
}

async function startAudit() {
    if (!fs.existsSync(HUNTS_FILE)) {
        console.error("❌ No active_hunts.json found.");
        return;
    }

    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
    const rotationHunts = hunts.filter(h => h.strategyId === 'golden_rotation' && h.status === 'closed');

    if (rotationHunts.length === 0) {
        console.log("ℹ️ No closed rotation hunts found to audit.");
        return;
    }

    console.log(`\n🔍 Auditing ${rotationHunts.length} Rotation Trades for VMAX Purity...\n`);

    let stats = {
        aboveVmaxWin: 0,
        aboveVmaxLoss: 0,
        belowVmaxWin: 0,
        belowVmaxLoss: 0,
        totalDist: 0,
        count: 0
    };

    const results = [];

    for (const hunt of rotationHunts) {
        const entryTs = new Date(hunt.entryTime).getTime();
        const klines = await fetchHistoricalKlines(hunt.symbol, entryTs);
        const vmaxAtEntry = calculateHistoricalVmax(klines, entryTs);

        if (!vmaxAtEntry) {
            // If it's a Monday entry, VMAX might be current day, handle gracefully
            results.push({
                Symbol: hunt.symbol,
                PnL: (hunt.pnl || 0).toFixed(2) + "%",
                "At Entry": "MONDAY / NO PREV MAX",
                "Dist %": "0.00%",
                EntryTime: new Date(hunt.entryTime).toLocaleDateString()
            });
            continue;
        }

        const isAbove = hunt.entryPrice > vmaxAtEntry;
        const isWin = (hunt.pnl || 0) > 0;
        const dist = ((hunt.entryPrice - vmaxAtEntry) / vmaxAtEntry) * 100;

        if (isAbove) {
            if (isWin) stats.aboveVmaxWin++; else stats.aboveVmaxLoss++;
        } else {
            if (isWin) stats.belowVmaxWin++; else stats.belowVmaxLoss++;
        }

        stats.totalDist += dist;
        stats.count++;

        results.push({
            Symbol: hunt.symbol,
            PnL: (hunt.pnl || 0).toFixed(2) + "%",
            "At Entry": isAbove ? "ABOVE VMAX" : "BELOW VMAX",
            "Dist %": dist.toFixed(2) + "%",
            EntryTime: new Date(hunt.entryTime).toLocaleDateString()
        });

        // Avoid rate limit
        await new Promise(r => setTimeout(r, 100));
    }

    console.table(results);

    console.log(`\n📊 --- VMAX AUDIT SUMMARY --- 📊`);
    console.log(`🟢 ABOVE VMAX WINS: ${stats.aboveVmaxWin}`);
    console.log(`🔴 ABOVE VMAX LOSS: ${stats.aboveVmaxLoss}`);

    const totalAbove = stats.aboveVmaxWin + stats.aboveVmaxLoss;
    if (totalAbove > 0) {
        console.log(`📈 Win Rate Above VMAX: ${((stats.aboveVmaxWin / totalAbove) * 100).toFixed(1)}%`);
    }

    if (stats.count > 0) {
        console.log(`📏 Avg Entry Distance from VMAX: ${(stats.totalDist / stats.count).toFixed(2)}%\n`);
    }

    if (stats.belowVmaxLoss + stats.belowVmaxWin > 0) {
        console.log(`⚠️ WARNING: ${stats.belowVmaxLoss + stats.belowVmaxWin} trades entered BELOW VMAX.`);
    }
}

startAudit();
