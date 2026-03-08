
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { registerNewHunt, ActiveHunt } from './strategyTracker';

interface VwapData {
    max: number;
    min: number;
    mid: number;
    last15mClose: number;
}

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');
const CONFIG_FILE = path.join(process.cwd(), 'server', 'bot_config.json');

const vwapCache = new Map<string, { wMax: number, wMin: number, currentMid: number, expires: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache
let isScanning = false;

async function fetchBinanceKlines(symbol: string, interval: string, limit: number) {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    try {
        const res = await axios.get(url);
        return res.data.map((d: any) => ({
            time: Math.floor(d[0] / 1000),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (err) { return []; }
}

async function getVwapData(symbol: string): Promise<VwapData | null> {
    const now = Date.now();
    const cached = vwapCache.get(symbol);

    let wMax: number, wMin: number, currentMid: number;

    if (cached && cached.expires > now) {
        wMax = cached.wMax;
        wMin = cached.wMin;
        currentMid = cached.currentMid;
    } else {
        const klines = await fetchBinanceKlines(symbol, '1d', 30);
        if (klines.length < 15) return null;

        const getMonTs = (ts: number) => {
            const d = new Date(ts * 1000);
            const day = d.getUTCDay();
            const diff = (day === 0 ? 6 : day - 1);
            const mon = new Date(ts * 1000);
            mon.setUTCHours(0, 0, 0, 0);
            mon.setUTCDate(mon.getUTCDate() - diff);
            return Math.floor(mon.getTime() / 1000);
        };

        const nowTs = Math.floor(now / 1000);
        const mondayTs = getMonTs(nowTs);
        wMax = -Infinity;
        wMin = Infinity;
        currentMid = 0;

        const rawVwap = klines.map((k: any) => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        klines.forEach((k: any, index: number) => {
            const dailyVwap = rawVwap[index];
            if (getMonTs(k.time) === mondayTs && index < klines.length - 1) {
                if (dailyVwap > wMax) wMax = dailyVwap;
                if (dailyVwap < wMin) wMin = dailyVwap;
            }
            if (index === klines.length - 1) currentMid = dailyVwap;
        });

        if (wMax === -Infinity) wMax = currentMid;
        vwapCache.set(symbol, { wMax, wMin, currentMid, expires: now + CACHE_DURATION });
    }

    const klines15m = await fetchBinanceKlines(symbol, '15m', 2);
    if (klines15m.length < 1) return null;
    const lastClose = klines15m[klines15m.length - 1].close;

    return { max: wMax, min: wMin, mid: currentMid, last15mClose: lastClose };
}

type WhaleCategory = 'BOTTOM_BOUNCE' | 'LOADING_ZONE' | 'SILENT_ACCUM' | 'NONE';

function getWhaleStatus(vwap: VwapData): { category: WhaleCategory, intensity: number } {
    const price = vwap.last15mClose;

    // 1. BOTTOM BOUNCE: Just above Min (Weekly Floor)
    if (price > vwap.min && price < (vwap.min * 1.05)) {
        return { category: 'BOTTOM_BOUNCE', intensity: 90 };
    }

    // 2. LOADING ZONE: Between Min and Mid
    if (price > vwap.min && price < vwap.mid) {
        return { category: 'LOADING_ZONE', intensity: 75 };
    }

    return { category: 'NONE', intensity: 0 };
}

export async function runRotationEngine() {
    if (isScanning) return;
    isScanning = true;
    console.log(`[RotationEngine] 🛰️ Running Market Rotation Check...`);

    try {
        // 1. Fetch Top 150 Volume USDT Pairs (Increased from 100)
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const topSymbols = res.data
            .filter((t: any) => t.symbol.endsWith('USDT'))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 150)
            .map((t: any) => t.symbol);

        const currentActive = fs.existsSync(HUNTS_FILE) ? JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8')) : [];
        const rotationActive = currentActive.filter((h: ActiveHunt) => h.status === 'active' && h.strategyId === 'golden_rotation');

        console.log(`[RotationEngine] Checking ${rotationActive.length} active rotation slots...`);

        // 2. Check exits for currently active
        const toClose: string[] = [];
        for (const hunt of rotationActive) {
            const vwap = await getVwapData(hunt.symbol);
            if (!vwap) continue;
            const isFullLong = vwap.last15mClose > vwap.max && vwap.last15mClose > vwap.mid && vwap.last15mClose > vwap.min;
            if (!isFullLong) {
                console.log(`[RotationEngine] 🚨 Lost Full Long status for ${hunt.symbol}. Preparing to exit.`);
                toClose.push(hunt.symbol);
            }
        }

        // 3. Scan top symbols for new entries
        const candidates: { symbol: string, price: number, density: number, whale: WhaleCategory }[] = [];
        const MAX_SLOTS = 3;
        const STABLECOINS = [
            'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USTC',
            'EUR', 'GBP', 'JPY', 'USDP', 'GUSD', 'PYUSD', 'AEUR', 'ZUSD'
        ];
        const currentOpenCount = rotationActive.length - toClose.length;

        if (currentOpenCount < MAX_SLOTS) {
            console.log(`[RotationEngine] Slot utilization: ${currentOpenCount}/${MAX_SLOTS}. Searching for ${MAX_SLOTS - currentOpenCount} more candidates...`);

            // Get all historical hunts for cooldown check
            const allHunts: ActiveHunt[] = currentActive;

            for (const symbol of topSymbols) {
                if (candidates.length >= (MAX_SLOTS - currentOpenCount)) break;

                // A. Filter Stablecoins & Pegged Assets
                const isStable = STABLECOINS.some(s => symbol.includes(s));
                if (isStable) {
                    // console.log(`[RotationEngine] 🛡️ Filtering stablecoin/pegged: ${symbol}`);
                    continue;
                }

                // B. Already active in ANY strategy?
                if (allHunts.find((h: any) => h.symbol === symbol && h.status === 'active')) continue;

                // C. RE-ENTRY COOL-DOWN (4h)
                // If we lost money on this coin in the last 4 hours, skip it.
                const recentLoss = allHunts.find((h: any) =>
                    h.symbol === symbol &&
                    h.status === 'closed' &&
                    h.pnl < 0 &&
                    (new Date().getTime() - new Date(h.exitTime).getTime()) < (4 * 60 * 60 * 1000)
                );
                if (recentLoss) {
                    // console.log(`[RotationEngine] 🧊 Cool-down active for ${symbol} (Recent Loss)`);
                    continue;
                }

                const vwap = await getVwapData(symbol);
                if (!vwap) continue;

                // --- CLIMAX PROTECTION & PURITY LOGIC ---
                // 1. Distance Check: Price must be above VMAX but NOT more than 5% above it
                const distFromMax = (vwap.last15mClose - vwap.max) / vwap.max;
                const MAX_DISTANCE_PCT = 0.05; // 5% limit to avoid buying the "Climax"

                // 2. Full Long Alignment (Purity Check): 
                //    - Close > Max (Weekly Max so far)
                //    - Close > Mid (Daily VWAP / "Pure" Trend)
                //    - Close > Min (Weekly Floor)
                const isFullLong = vwap.last15mClose > vwap.max && vwap.last15mClose > vwap.mid && vwap.last15mClose > vwap.min;

                // 3. Weekly Purity: On Mondays, ensure we are at least 0.5% above Daily VWAP to confirm breakout
                const isMonday = new Date().getDay() === 1;
                const dailyPurityBuffer = isMonday ? 1.005 : 1.0;
                const isPure = vwap.last15mClose >= (vwap.mid * dailyPurityBuffer);

                // 4. SMART FEATURE: DENSITY SQUEEZE
                // Measure the convergence between Max, Mid, and Min.
                const vwapValues = [vwap.max, vwap.mid, vwap.min];
                const avgVwap = vwapValues.reduce((a, b) => a + b, 0) / 3;
                const avgDiffPct = vwapValues.reduce((acc, v) => acc + (Math.abs(v - avgVwap) / avgVwap), 0) / 3;
                const densityScore = Math.max(0, 100 * (1 - (avgDiffPct / 0.02))); // 2% sensitivity

                // 5. SMART FEATURE: WHALE CONFIRMATION
                const whale = getWhaleStatus(vwap);
                const isWhaleBacked = whale.category !== 'NONE';

                // 6. Trigger Condition
                // We enter if isFullLong AND isPure AND distFromMax <= 5%
                // Priority given to High Density (Squeeze) AND Whale Backing
                if (isFullLong && isPure && distFromMax <= MAX_DISTANCE_PCT) {
                    const isSqueeze = densityScore >= 80;
                    console.log(`[RotationEngine] 🛰️ Found ${isSqueeze ? 'HIGH CONVICTION' : 'CANDIDATE'}: ${symbol} (Dist: ${(distFromMax * 100).toFixed(2)}%, Density: ${densityScore}%, Whale: ${whale.category})`);
                    candidates.push({ symbol, price: vwap.last15mClose, density: Math.round(densityScore), whale: whale.category });
                } else if (isFullLong && distFromMax > MAX_DISTANCE_PCT) {
                    // console.log(`[RotationEngine] ⛈️ Skipping overextended candidate: ${symbol} (Dist: ${(distFromMax * 100).toFixed(2)}%)`);
                }

                // Avoid rate limit
                await new Promise(r => setTimeout(r, 60)); // Slightly faster sleep
            }
        }

        // 4. Apply Exits
        if (toClose.length > 0) {
            const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
            hunts.forEach((h: any) => {
                if (toClose.includes(h.symbol) && h.strategyId === 'golden_rotation' && h.status === 'active') {
                    h.status = 'closed';
                    h.exitPrice = h.lastPrice || h.entryPrice;
                    h.exitTime = new Date().toISOString();
                    h.reason = 'Lost Full Long Status (Rotation Swapped Out)';
                    console.log(`[RotationEngine] 💸 CLOSED ${h.symbol} (Rotation Exit)`);
                }
            });
            fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        }

        // 5. Apply Entries
        for (const cand of (candidates as any[])) {
            console.log(`[RotationEngine] 🛰️ Rotating Capital into: ${cand.symbol} (${cand.whale || 'NONE'})`);
            registerNewHunt(cand.symbol, cand.price, 'golden_rotation', cand.density, cand.whale);
        }

        // 6. EXTRA SAFETY: If slots > 3 (bug/legacy), close oldest ones
        const finalActive = (fs.existsSync(HUNTS_FILE) ? JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8')) : [])
            .filter((h: ActiveHunt) => h.status === 'active' && h.strategyId === 'golden_rotation')
            .sort((a: any, b: any) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

        if (finalActive.length > MAX_SLOTS) {
            console.log(`[RotationEngine] 🧹 Cleaning up ${finalActive.length - MAX_SLOTS} excess slots...`);
            const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
            // Keep the 3 NEWEST ones, close the oldest
            const toPurge = finalActive.slice(0, finalActive.length - MAX_SLOTS).map((h: any) => h.symbol);
            hunts.forEach((h: any) => {
                if (toPurge.includes(h.symbol) && h.strategyId === 'golden_rotation' && h.status === 'active') {
                    h.status = 'closed';
                    h.exitPrice = h.currentPrice || h.entryPrice;
                    h.exitTime = new Date().toISOString();
                    h.reason = 'Slot Capacity Purge (Self-Correction)';
                }
            });
            fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        }

        console.log(`[RotationEngine] Cycle completed. Final Active Slots: ${Math.min(finalActive.length, MAX_SLOTS)}/${MAX_SLOTS}`);

    } catch (err: any) {
        console.error(`[RotationEngine] Error:`, err.message);
    } finally {
        isScanning = false;
    }
}
