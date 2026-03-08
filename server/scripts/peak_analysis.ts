
import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

function analyzePeakPerformance() {
    console.log("📊 Analyzing Peak PnL Performance (Mar 7th & 8th)...");

    if (!fs.existsSync(HUNTS_FILE)) {
        console.error("❌ active_hunts.json not found!");
        return;
    }

    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));

    const results = {
        '3/7/2026': { maxPeak: 0, bestSymbol: '' },
        '3/8/2026': { maxPeak: 0, bestSymbol: '' }
    };

    hunts.forEach((h: any) => {
        const date = new Date(h.entryTime).toLocaleDateString();
        if (results[date]) {
            const peakPnl = ((h.peakPrice - h.entryPrice) / h.entryPrice) * 100;
            if (peakPnl > results[date].maxPeak) {
                results[date].maxPeak = peakPnl;
                results[date].bestSymbol = h.symbol;
            }
        }
    });

    console.log("\n🚀 PEAK PERFORMANCE REPORT:");
    console.table(Object.entries(results).map(([date, data]) => ({
        Date: date,
        'Max Peak PnL': data.maxPeak.toFixed(2) + '%',
        'Best Token': data.bestSymbol
    })));
}

analyzePeakPerformance();
