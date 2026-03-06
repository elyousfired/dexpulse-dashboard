import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

async function generateFullReport() {
    console.log(`\n==========================================`);
    console.log(`   DEXPULSE FULL PERFORMANCE REPORT      `);
    console.log(`==========================================\n`);

    if (!fs.existsSync(HUNTS_FILE)) {
        console.log("❌ No data file found. Start some hunts first!");
        return;
    }

    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));

    const closed = hunts.filter(h => h.status === 'closed');
    const active = hunts.filter(h => h.status === 'active');

    if (closed.length === 0 && active.length === 0) {
        console.log("ℹ️ No trades recorded yet.");
        return;
    }

    // Performance Calculations
    const totalPnl = closed.reduce((acc, h) => acc + (h.pnl || 0), 0);
    const wins = closed.filter(h => (h.pnl || 0) > 0);
    const losses = closed.filter(h => (h.pnl || 0) <= 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length * 100) : 0;

    console.log(`📈 OVERALL STATS:`);
    console.log(`   - Total Trades: ${closed.length + active.length}`);
    console.log(`   - Closed Trades: ${closed.length}`);
    console.log(`   - Win Rate: ${winRate.toFixed(2)}% (${wins.length}W / ${losses.length}L)`);
    console.log(`   - Aggregate Net PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`);
    console.log(`   - Currently Tracking: ${active.length} active hunts\n`);

    if (closed.length > 0) {
        console.log(`📜 DETAILED TRADE LOG (Closed):`);
        console.log(`   | Symbol       | PnL %   | Status |`);
        console.log(`   |--------------|---------|--------|`);
        closed.forEach(h => {
            const pnlStr = (h.pnl >= 0 ? '+' : '') + h.pnl.toFixed(2) + '%';
            console.log(`   | ${h.symbol.padEnd(12)} | ${pnlStr.padEnd(7)} | ${h.pnl >= 0 ? 'WIN ✅' : 'LOSS ❌'}  |`);
        });
        console.log("");
    }

    if (active.length > 0) {
        console.log(`⏳ OPEN POSITIONS:`);
        active.forEach(h => {
            const currentPnl = h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice * 100) : 0;
            console.log(`   • ${h.symbol.padEnd(12)} | Entry: $${h.entryPrice.toLocaleString()} | Live: ${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)}%`);
        });
    }

    console.log(`\n==========================================`);
    console.log(`   Status: SCANNING 24/7 | Logic: 15m Close `);
    console.log(`==========================================\n`);
}

generateFullReport();
