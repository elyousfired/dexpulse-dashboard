
import fs from 'fs';
import path from 'path';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');

const STABLECOINS = [
    'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USTC',
    'EUR', 'GBP', 'JPY', 'USDP', 'GUSD', 'PYUSD', 'AEUR', 'ZUSD'
];

function purgeHunts() {
    console.log("🧹 Starting Data Purge...");

    if (!fs.existsSync(HUNTS_FILE)) {
        console.error("❌ active_hunts.json not found!");
        return;
    }

    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
    const initialCount = hunts.length;

    // Purge logic: 
    // 1. Remove all 'golden_rotation' hunts that are stablecoins
    // 2. Optional: Remove ALL 'golden_rotation' active hunts to start fresh
    const cleanedHunts = hunts.filter((h: any) => {
        const isRotation = h.strategyId === 'golden_rotation';
        const isStable = STABLECOINS.some(s => h.symbol.includes(s));

        // If it's a rotation stablecoin, or if we want a TOTAL reset of rotation:
        if (isRotation && (isStable || h.status === 'active')) {
            console.log(`🗑️ Purging: ${h.symbol} (${isStable ? 'Stablecoin' : 'Reset'})`);
            return false;
        }
        return true;
    });

    fs.writeFileSync(HUNTS_FILE, JSON.stringify(cleanedHunts, null, 2));
    console.log(`✅ Purge complete! Removed ${initialCount - cleanedHunts.length} entries.`);
}

purgeHunts();
