
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const HUNTS_FILE = 'server/data/active_hunts.json';

async function fetchBinanceKlines(symbol: string, interval: string, endTime: number) {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=50&endTime=${endTime}`;
    try {
        const res = await axios.get(url);
        return res.data.map((d: any) => ({
            time: Math.floor(d[0] / 1000),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (err) { return []; }
}

function getMonTs(ts: number) {
    const d = new Date(ts * 1000);
    const day = d.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1);
    const mon = new Date(ts * 1000);
    mon.setUTCHours(0, 0, 0, 0);
    mon.setUTCDate(mon.getUTCDate() - diff);
    return Math.floor(mon.getTime() / 1000);
}

async function runAudit() {
    console.log("🔍 Starting Rotation Audit (VMAX Alignment)...");

    if (!fs.existsSync(HUNTS_FILE)) {
        console.error("❌ active_hunts.json not found!");
        return;
    }

    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
    const rotations = hunts.filter((h: any) => h.strategyId === 'golden_rotation');

    if (rotations.length === 0) {
        console.log("ℹ️ No rotation trades found to audit.");
        return;
    }

    const report = [];

    for (const h of rotations) {
        const entryTs = Math.floor(new Date(h.entryTime).getTime() / 1000);
        const mondayTs = getMonTs(entryTs);

        // Fetch klines leading up to entry
        const klines = await fetchBinanceKlines(h.symbol, '1d', entryTs * 1000);

        if (klines.length === 0) {
            report.push({
                Symbol: h.symbol,
                Entry: h.entryPrice,
                VMAX: 'N/A',
                Status: 'Error (No Data)',
                Time: h.entryTime
            });
            continue;
        }

        let wMax = -Infinity;
        const rawVwap = klines.map((k: any) => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

        klines.forEach((k: any, index: number) => {
            if (getMonTs(k.time) === mondayTs) {
                if (rawVwap[index] > wMax) wMax = rawVwap[index];
            }
        });

        if (wMax === -Infinity) wMax = rawVwap[rawVwap.length - 1];

        const isAbove = h.entryPrice > wMax;
        const distPct = ((h.entryPrice - wMax) / wMax) * 100;

        report.push({
            Symbol: h.symbol,
            Entry: h.entryPrice.toFixed(4),
            VMAX: wMax.toFixed(4),
            Alignment: isAbove ? '✅ ABOVE VMAX' : '❌ BELOW VMAX',
            'Dist %': distPct.toFixed(2) + '%',
            PnL: (h.pnl || 0).toFixed(2) + '%',
            Time: new Date(h.entryTime).toLocaleDateString()
        });

        // Sleep to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    console.table(report);
    console.log("\n📊 AUDIT SUMMARY:");
    const above = report.filter(r => r.Alignment.includes('ABOVE')).length;
    console.log(`- Total Trades: ${report.length}`);
    console.log(`- Above VMAX: ${above} (${((above / report.length) * 100).toFixed(1)}%)`);
    console.log(`- Below VMAX: ${report.length - above} (${(((report.length - above) / report.length) * 100).toFixed(1)}%)`);
}

runAudit();
