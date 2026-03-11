
import axios from 'axios';

const STABLECOINS = [
    'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USTC',
    'EUR', 'GBP', 'JPY', 'USDP', 'GUSD', 'PYUSD', 'AEUR', 'ZUSD'
];

async function getVwapData(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1w&limit=2`;
        const res = await axios.get(url);
        if (!res.data || res.data.length < 2) return null;

        const klines = res.data;
        let totalPV = 0;
        let totalV = 0;
        let max = -Infinity;
        let min = Infinity;

        for (const k of klines) {
            const high = parseFloat(k[2]);
            const low = parseFloat(k[3]);
            const close = parseFloat(k[4]);
            const vol = parseFloat(k[5]);
            const typical = (high + low + close) / 3;
            totalPV += typical * vol;
            totalV += vol;
            if (high > max) max = high;
            if (low < min) min = low;
        }

        const mid = totalV > 0 ? totalPV / totalV : 0;
        
        // Get 15m Close
        const res15 = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=1`);
        const last15mClose = parseFloat(res15.data[0][4]);

        return { max, min, mid, last15mClose };
    } catch (e) { return null; }
}

async function debugScan() {
    console.log("🛰️ INITIALIZING COMPREHENSIVE ROTATION SCAN (V5.4)...");
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 1=Mon, 2=Tue
    const isEarlyWeek = dayOfWeek === 1 || dayOfWeek === 2;
    console.log(`[Context] Day of Week: ${dayOfWeek} | Early week: ${isEarlyWeek}`);
    console.log("--------------------------------------------------");
    
    try {
        const { data: tickers } = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const topSymbols = tickers
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 300) // Scan top 300 to find hidden gems
            .map(t => t.symbol);

        let confirmedCount = 0;

        for (const symbol of topSymbols) {
            const base = symbol.replace('USDT', '');
            if (STABLECOINS.includes(base)) continue;

            const vwap = await getVwapData(symbol);
            if (!vwap) continue;

            // EXACT PRODUCTION LOGIC (v5.4)
            const isStructuralSignal = isEarlyWeek
                ? (vwap.mid > vwap.max && vwap.max >= vwap.min)
                : (vwap.mid > vwap.max && vwap.max > vwap.min);
            
            const isPriceBreakout = vwap.last15mClose > vwap.mid;
            const isConfirmed = isStructuralSignal && isPriceBreakout;
            
            if (isConfirmed) {
                confirmedCount++;
                console.log(`✅ [CONFIRMED] ${symbol.padEnd(10)} | Price: $${vwap.last15mClose.toFixed(4)} | Mid: $${vwap.mid.toFixed(4)}`);
            } else {
                // Verbose Near-Miss Tracking
                const midDist = ((vwap.last15mClose - vwap.mid) / vwap.mid) * 100;
                const structDist = ((vwap.mid - vwap.max) / vwap.max) * 100;
                
                if (midDist > -2 || structDist > -2) {
                    console.log(`⚠️  [NEARBY]   ${symbol.padEnd(10)} | Price: ${midDist.toFixed(1)}% from Mid | Struct: ${structDist.toFixed(1)}% from Over-Max`);
                }
            }
        }
        
        if (confirmedCount === 0) {
            console.log("⚠️ No tokens currently meet the Rotation criteria in the Top 300.");
        }
    } catch (e) {
        console.error("Scan Error:", e.message);
    }
    
    console.log("--------------------------------------------------");
    console.log("📡 Scan Complete.");
}

async function liveScan() {
    console.clear();
    
    // --- NEW: FETCH ACTIVE SLOTS FROM VPS ---
    try {
        const vpsUrl = 'http://146.0.4.48:3001/api/hunts';
        const res = await axios.get(vpsUrl, { timeout: 3000 });
        const hunts = res.data.filter(h => h.status === 'active');
        
        console.log("--------------------------------------------------");
        console.log(`📡 SERVER SLOTS: ${hunts.length}/3 ACTIVE`);
        console.log("--------------------------------------------------");
        
        if (hunts.length === 0) {
            console.log("   (No active trades currently in slots)");
        } else {
            hunts.forEach((h, i) => {
                const pnl = h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice * 100) : 0;
                console.log(` Slot ${i+1}: ${h.symbol.padEnd(10)} | PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% | Entry: $${h.entryPrice.toLocaleString()}`);
            });
        }
        console.log("--------------------------------------------------");
    } catch (e) {
        console.log("--------------------------------------------------");
        console.log(`📡 SERVER SLOTS: (Connecting to VPS API...)`);
        console.log("--------------------------------------------------");
    }

    await debugScan();
    console.log(`\n[Heartbeat] Next scan in 10s... (CTRL+C to stop)`);
}

// Initial Run
liveScan();

// Loop every 10 seconds
setInterval(liveScan, 10000);
