import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HUNTS_FILE = path.join(__dirname, 'server', 'data', 'active_hunts.json');
const HISTORY_FILE = path.join(__dirname, 'server', 'data', 'trades_history.json');

function loadAllData() {
    let hunts = [];
    let history = [];
    try {
        if (fs.existsSync(HUNTS_FILE)) hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
    } catch (e) {}
    try {
        if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {}

    // Merge and Deduplicate
    const combined = [...hunts, ...history];
    const uniqueMap = new Map();
    combined.forEach(h => {
        const id = `${h.symbol}-${h.entryTime}`;
        if (!uniqueMap.has(id)) uniqueMap.set(id, h);
        else if (h.status === 'closed') uniqueMap.set(id, h);
    });

    return Array.from(uniqueMap.values());
}

async function generateFullReport() {
    console.log(`\n==========================================`);
    console.log(`   DEXPULSE FULL PERFORMANCE REPORT (V2) `);
    console.log(`==========================================\n`);

    const data = loadAllData();
    const closed = data.filter(h => h.status === 'closed');
    const active = data.filter(h => h.status === 'active');

    if (closed.length === 0 && active.length === 0) {
        console.log("ℹ️ No trades recorded yet in active_hunts or trades_history.");
        return;
    }

    const totalPnl = closed.reduce((acc, h) => acc + (h.pnl || 0), 0);
    const wins = closed.filter(h => (h.pnl || 0) > 0);
    const losses = closed.filter(h => (h.pnl || 0) <= 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length * 100) : 0;

    console.log(`📈 OVERALL STATS (Consolidated):`);
    console.log(`   - Total Trades Found: ${closed.length + active.length}`);
    console.log(`   - Closed Trades: ${closed.length}`);
    console.log(`   - Win Rate: ${winRate.toFixed(2)}% (${wins.length}W / ${losses.length}L)`);
    console.log(`   - Aggregate Net PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`);
    console.log(`   - Currently Active: ${active.length}\n`);

    if (closed.length > 0) {
        console.log(`📜 HISTORICAL LOG (Last 20 Closed):`);
        console.log(`   | Symbol       | PnL %   | Status | Time                |`);
        console.log(`   |--------------|---------|--------|---------------------|`);
        closed.sort((a,b) => new Date(b.entryTime) - new Date(a.entryTime)).slice(0, 20).forEach(h => {
            const pnlStr = (h.pnl >= 0 ? '+' : '') + h.pnl.toFixed(2) + '%';
            const timeStr = new Date(h.entryTime).toLocaleString().slice(0, 19);
            console.log(`   | ${h.symbol.padEnd(12)} | ${pnlStr.padEnd(7)} | ${h.pnl >= 0 ? 'WIN ✅' : 'LOSS ❌'}  | ${timeStr.padEnd(19)} |`);
        });
        console.log("");
    }

    if (active.length > 0) {
        console.log(`⏳ OPEN POSITIONS:`);
        active.forEach(h => {
            const currentPnl = h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice * 100) : 0;
            console.log(`   • ${h.symbol.padEnd(12)} | Entry: $${h.entryPrice.toFixed(4)} | Live: ${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)}%`);
        });
    }

    console.log(`\n==========================================`);
    console.log(`   DataSource: active_hunts + trades_history `);
    console.log(`==========================================\n`);
}

generateFullReport();

