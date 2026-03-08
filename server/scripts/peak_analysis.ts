
import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

function analyzePeakPerformance() {
    console.log("📊 Analyzing Strategic Peak PnL (Mar 7th & 8th)...");

    if (!fs.existsSync(HUNTS_FILE)) {
        console.error("❌ active_hunts.json not found!");
        return;
    }

    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));

    const stats = {
        '3/7/2026': { totalPeakPnl: 0, totalCurrentPnl: 0, count: 0 },
        '3/8/2026': { totalPeakPnl: 0, totalCurrentPnl: 0, count: 0 }
    };

    hunts.forEach((h: any) => {
        const date = new Date(h.entryTime).toLocaleDateString();
        if (stats[date]) {
            const peakPnl = ((h.peakPrice - h.entryPrice) / h.entryPrice) * 100;
            const currentPnl = h.pnl || (((h.currentPrice || h.entryPrice) - h.entryPrice) / h.entryPrice) * 100;

            stats[date].totalPeakPnl += peakPnl;
            stats[date].totalCurrentPnl += currentPnl;
            stats[date].count += 1;
        }
    });

    console.log("\n🚀 STRATEGY PERFORMANCE REPORT (CUMULATIVE):");
    console.table(Object.entries(stats).map(([date, data]) => ({
        Date: date,
        'Trades': data.count,
        'Strategy Peak PnL': (data.totalPeakPnl).toFixed(2) + '%',
        'Final/Current PnL': (data.totalCurrentPnl).toFixed(2) + '%',
        'Profit "On the Table"': (data.totalPeakPnl - data.totalCurrentPnl).toFixed(2) + '%'
    })));

    console.log("\n💡 Note: 'Strategy Peak' represents the sum of max profits reached by all tokens of that day.");
}

analyzePeakPerformance();
