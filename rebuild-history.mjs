import fs from 'fs';
import path from 'path';

const LOG_FILE = 'full_history_raw.txt';
const OUTPUT_FILE = 'server/data/active_hunts.json';

// Ensure the directory exists
const dir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(LOG_FILE)) {
    console.error(`Error: ${LOG_FILE} not found! Run the grep command first.`);
    process.exit(1);
}

const content = fs.readFileSync(LOG_FILE, 'utf8');
const lines = content.split('\n');

const tradesMap = new Map();
const history = [];

console.log(`Parsing ${lines.length} log lines...`);

lines.forEach(line => {
    // 1. Detect Registration
    if (line.includes('REGISTERED NEW HUNT:')) {
        const match = line.match(/REGISTERED NEW HUNT: ([A-Z0-9]+) at ([\d.]+)/);
        if (match) {
            const [_, symbol, price] = match;
            const entryPrice = parseFloat(price);

            // Extract timestamp if present, otherwise guess a gap
            let time = new Date().toISOString();
            const timeMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
            if (timeMatch) time = new Date(timeMatch[1]).toISOString();

            const trade = {
                symbol,
                entryPrice,
                entryTime: time,
                peakPrice: entryPrice,
                status: 'active',
                capital: 10.0,
                tier: 1,
                strategyId: line.includes('golden_rotation') ? 'golden_rotation' : 'golden_signal' // Best guess
            };

            // If it's a new registration for a symbol already "active", we'll treat it as a new distinct hunt
            tradesMap.set(symbol, trade);
            history.push(trade);
        }
    }

    // 2. Detect Closure
    if (line.includes('CLOSED') || line.includes('HUNT ARCHIVED')) {
        const match = line.match(/CLOSED ([A-Z0-9]+)/);
        if (match) {
            const symbol = match[1];
            const trade = tradesMap.get(symbol);
            if (trade && trade.status === 'active') {
                trade.status = 'closed';
                trade.exitPrice = trade.entryPrice; // Default if not in log
                trade.exitTime = new Date().toISOString();

                // Try to extract PnL if available
                const pnlMatch = line.match(/PnL: ([+-]?[\d.]+)/);
                if (pnlMatch) {
                    trade.pnl = parseFloat(pnlMatch[1]);
                    trade.exitPrice = trade.entryPrice * (1 + (trade.pnl / 100));
                }
            }
        }
    }
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(history, null, 2));
console.log(`Successfully reconstructed ${history.length} trades.`);
console.log(`Saved to ${OUTPUT_FILE}`);
