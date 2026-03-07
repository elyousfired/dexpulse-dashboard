import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

if (!fs.existsSync(HUNTS_FILE)) {
    console.log("❌ active_hunts.json not found.");
    process.exit(1);
}

try {
    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
    const rotationHunts = hunts.filter(h => h.strategyId === 'golden_rotation');

    if (rotationHunts.length === 0) {
        console.log("ℹ️ No rotation hunts found in registry.");
    } else {
        console.log("\n📊 --- GOLDEN ROTATION REPORT --- 📊\n");
        const report = rotationHunts.map(h => {
            const pnl = h.pnl !== undefined
                ? h.pnl
                : (h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice * 100) : 0);

            return {
                Symbol: h.symbol,
                Status: h.status.toUpperCase(),
                PnL: pnl.toFixed(2) + "%",
                EntryTime: new Date(h.entryTime).toLocaleString(),
                Reason: h.reason || "Active"
            };
        });
        console.table(report);

        const totalPnl = rotationHunts.reduce((acc, h) => acc + (h.pnl || 0), 0);
        console.log(`\n✅ Total Realized PnL: ${totalPnl.toFixed(2)}%`);
        console.log(`📡 Total Swaps: ${rotationHunts.length}\n`);
    }
} catch (err) {
    console.error("❌ Error reading report:", err.message);
}
