import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');
const ALERTED_FILE = path.join(process.cwd(), 'server', 'alerted_tokens.json');

async function generateReport() {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`\n==========================================`);
    console.log(`   DEXPULSE DAILY REPORT: ${today}   `);
    console.log(`==========================================\n`);

    // 1. Signals Summary
    if (fs.existsSync(ALERTED_FILE)) {
        const alerted = JSON.parse(fs.readFileSync(ALERTED_FILE, 'utf8'));
        if (alerted.date === today) {
            console.log(`📡 TODAY'S SIGNALS (${alerted.ids.length}):`);
            console.log(`   ${alerted.ids.join(', ') || 'No signals yet'}\n`);
        } else {
            console.log(`📡 TODAY'S SIGNALS: 0 (Waiting for scan...)\n`);
        }
    }

    // 2. Trading Summary
    if (fs.existsSync(HUNTS_FILE)) {
        const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));

        const todayClosed = hunts.filter(h => h.status === 'closed' && h.exitTime && h.exitTime.startsWith(today));
        const active = hunts.filter(h => h.status === 'active');

        console.log(`💰 PERFORMANCE SUMMARY:`);
        const todayPnl = todayClosed.reduce((acc, h) => acc + (h.pnl || 0), 0);
        console.log(`   - Closed Trades Today: ${todayClosed.length}`);
        console.log(`   - Daily Realized PnL: ${todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}%`);
        console.log(`   - Currently Open: ${active.length} hunts\n`);

        if (active.length > 0) {
            console.log(`📈 OPEN HUNTS:`);
            active.forEach(h => {
                const livePnl = h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice * 100) : 0;
                console.log(`   • ${h.symbol.padEnd(12)} | Entry: $${h.entryPrice.toLocaleString()} | Live: ${livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}%`);
            });
        }
    }

    console.log(`\n==========================================`);
    console.log(`   System: ONLINE | Updates: 5s         `);
    console.log(`==========================================\n`);
}

generateReport();
