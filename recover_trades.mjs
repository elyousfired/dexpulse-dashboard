import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

function recoverTrades() {
    if (!fs.existsSync(HUNTS_FILE)) {
        console.log("❌ Error: active_hunts.json not found.");
        return;
    }

    try {
        const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
        let recoveredCount = 0;

        const updatedHunts = hunts.map(hunt => {
            // Target trades closed by Institutional Risk Guard OR with unusually low/zero PnL during the reset window
            const isInstitutionalExit = hunt.reason && hunt.reason.includes("Institutional");
            const isZeroPnLReset = hunt.status === 'closed' && hunt.pnl === 0 && (new Date(hunt.exitTime).getTime() > Date.now() - 3600000); // Last 1 hour
            
            if (isInstitutionalExit || isZeroPnLReset) {
                console.log(`✅ Recovering ${hunt.symbol}...`);
                recoveredCount++;
                return {
                    symbol: hunt.symbol,
                    entryPrice: hunt.entryPrice,
                    entryTime: hunt.entryTime,
                    peakPrice: hunt.peakPrice,
                    status: 'active',
                    capital: hunt.capital,
                    strategyId: hunt.strategyId,
                    density: hunt.density,
                    tier: hunt.tier || 1,
                    lastVwapAnchor: hunt.lastVwapAnchor
                };
            }
            return hunt;
        });

        fs.writeFileSync(HUNTS_FILE, JSON.stringify(updatedHunts, null, 2));
        console.log(`\n🚀 SUCCESS: Recovered ${recoveredCount} trades.`);
        console.log("Please restart your dashboard/bot now.");

    } catch (e) {
        console.error("❌ Error recovering trades:", e.message);
    }
}

recoverTrades();
