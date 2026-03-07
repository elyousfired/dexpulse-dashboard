
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
    const [klines, klines15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 30),
        fetchBinanceKlines(symbol, '15m', 5)
    ]);
    if (klines.length < 15 || klines15m.length < 2) return null;

    const lastClose = klines15m[klines15m.length - 2].close;
    const getMonTs = (ts: number) => {
        const d = new Date(ts * 1000);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts * 1000);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const nowTs = Math.floor(Date.now() / 1000);
    const mondayTs = getMonTs(nowTs);
    let wMax = -Infinity;
    let wMin = Infinity;
    let currentMid = 0;

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
    return { max: wMax, min: wMin, mid: currentMid, last15mClose: lastClose };
}

export async function runRotationEngine() {
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
        const candidates: { symbol: string, price: number }[] = [];
        const MAX_SLOTS = 3;
        const currentOpenCount = rotationActive.length - toClose.length;

        if (currentOpenCount < MAX_SLOTS) {
            console.log(`[RotationEngine] Slot utilization: ${currentOpenCount}/${MAX_SLOTS}. Searching for ${MAX_SLOTS - currentOpenCount} more candidates...`);
            for (const symbol of topSymbols) {
                if (candidates.length >= (MAX_SLOTS - currentOpenCount)) break;

                // Extra check: Is it already active in ANY strategy?
                if (currentActive.find((h: any) => h.symbol === symbol && h.status === 'active')) continue;

                const vwap = await getVwapData(symbol);
                if (!vwap) continue;

                // Full Long = Price > Weekly Max AND Price > Mid AND Price > Min
                const isFullLong = vwap.last15mClose > vwap.max && vwap.last15mClose > vwap.mid && vwap.last15mClose > vwap.min;

                if (isFullLong) {
                    console.log(`[RotationEngine] 🛰️ Found potential candidate: ${symbol}`);
                    candidates.push({ symbol, price: vwap.last15mClose });
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
        for (const cand of candidates) {
            console.log(`[RotationEngine] 🛰️ Rotating Capital into: ${cand.symbol}`);
            registerNewHunt(cand.symbol, cand.price, 'golden_rotation');
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
    }
}
