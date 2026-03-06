
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
        // 1. Fetch Top 100 Volume USDT Pairs
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const topSymbols = res.data
            .filter((t: any) => t.symbol.endsWith('USDT'))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 100)
            .map((t: any) => t.symbol);

        const currentActive = fs.existsSync(HUNTS_FILE) ? JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8')) : [];
        const rotationActive = currentActive.filter((h: ActiveHunt) => h.status === 'active' && h.strategyId === 'golden_rotation');

        // 2. Scan for candidates
        const candidates: { symbol: string, price: number }[] = [];

        for (const symbol of topSymbols) {
            const vwap = await getVwapData(symbol);
            if (!vwap) continue;

            const isFullLong = vwap.last15mClose > vwap.max && vwap.last15mClose > vwap.mid && vwap.last15mClose > vwap.min;

            if (isFullLong) {
                candidates.push({ symbol, price: vwap.last15mClose });
            }

            // Avoid rate limit
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`[RotationEngine] Found ${candidates.length} Full Long candidates.`);

        // 3. Logic: Keep Top 3 Rotation Slots
        const MAX_SLOTS = 3;

        // Auto-Register new ones if slots available
        for (const cand of candidates) {
            if (rotationActive.length >= MAX_SLOTS) break;
            if (!rotationActive.find((h: any) => h.symbol === cand.symbol)) {
                console.log(`[RotationEngine] 🛰️ Rotating Capital into: ${cand.symbol}`);
                registerNewHunt(cand.symbol, cand.price, 'golden_rotation');
                // Refresh local list
                rotationActive.push({ symbol: cand.symbol } as any);
            }
        }

    } catch (err: any) {
        console.error(`[RotationEngine] Error:`, err.message);
    }
}
