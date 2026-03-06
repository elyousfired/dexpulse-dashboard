
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { registerNewHunt } from './strategyTracker';

// Types (Mirrored from types.ts to keep server standalone)
export interface CexTicker {
    id: string;
    symbol: string;
    pair: string;
    priceUsd: number;
    priceChangePercent24h: number;
    volume24h: number;
}

export interface OHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
}

export interface VwapData {
    max: number;
    min: number;
    mid: number;
    prevWeekVwap: number;
    currentWeekVwap: number;
    last15mClose: number;
    prev15mClose: number;
    history15m: number[]; // Added to support Catch-up logic
}

const ALERTED_FILE = path.join(process.cwd(), 'server', 'alerted_tokens.json');
const CONFIG_FILE = path.join(process.cwd(), 'server', 'bot_config.json');

// ─── Utility: Historical Data ────────────────────────────────

async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    try {
        const res = await axios.get(url);
        return res.data.map((d: any) => ({
            time: Math.floor(d[0] / 1000),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (err) {
        return [];
    }
}

async function fetchWeeklyVwapData(symbol: string): Promise<VwapData | null> {
    const [klines, klines15m] = await Promise.all([
        fetchBinanceKlines(symbol, '1d', 30),
        fetchBinanceKlines(symbol, '15m', 20)
    ]);

    if (klines.length < 15 || klines15m.length < 2) return null;

    const last15mClose = klines15m[klines15m.length - 2].close;
    const prev15mClose = klines15m[klines15m.length - 3]?.close || last15mClose;
    const history15m = klines15m.map(k => k.close);

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
    const prevMondayTs = mondayTs - (7 * 24 * 3600);

    let wMax = -Infinity;
    let wMin = Infinity;
    let currentMid = 0;

    const rawVwap = klines.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));

    klines.forEach((k, index) => {
        const dailyVwap = rawVwap[index];
        const isCompletedDay = index < klines.length - 1;
        const kMonTs = getMonTs(k.time);

        if (kMonTs === mondayTs && isCompletedDay) {
            if (dailyVwap > wMax) wMax = dailyVwap;
            if (dailyVwap < wMin) wMin = dailyVwap;
        }
        if (index === klines.length - 1) currentMid = dailyVwap;
    });

    let prevWeekQVol = 0, prevWeekBVol = 0, currWeekQVol = 0, currWeekBVol = 0;
    klines.forEach(k => {
        const kMonTs = getMonTs(k.time);
        if (kMonTs === prevMondayTs) {
            prevWeekQVol += k.quoteVolume;
            prevWeekBVol += k.volume;
        } else if (kMonTs === mondayTs) {
            currWeekQVol += k.quoteVolume;
            currWeekBVol += k.volume;
        }
    });

    const prevWeekVwap = prevWeekBVol > 0 ? prevWeekQVol / prevWeekBVol : 0;
    const currentWeekVwap = currWeekBVol > 0 ? currWeekQVol / currWeekBVol : currentMid;

    if (wMax === -Infinity) wMax = currentMid;
    if (wMin === Infinity) wMin = currentMid;

    return { max: wMax, min: wMin, mid: currentMid, prevWeekVwap, currentWeekVwap, last15mClose, prev15mClose, history15m };
}

// ─── Bot Implementation ──────────────────────────────────────

async function sendTelegram(config: any, text: string) {
    if (!config.enabled || !config.botToken || !config.chatId) return;
    const chatIds = config.chatId.split(',').map((id: string) => id.trim());
    for (const id of chatIds) {
        try {
            await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
                chat_id: id,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } catch (err: any) {
            console.error(`[SignalBot] Telegram Error:`, err.response?.data || err.message);
        }
    }
}

export async function runSignalScanner() {
    console.log(`[SignalBot] 🔍 Starting 24/7 Scan: ${new Date().toISOString()}`);

    // Load Config
    if (!fs.existsSync(CONFIG_FILE)) {
        console.log(`[SignalBot] ⚠️ No bot config found. Skipping.`);
        return;
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!config.enabled) return;

    // Load Alerted History
    let alerted: any = { date: '', ids: [] };
    if (fs.existsSync(ALERTED_FILE)) {
        alerted = JSON.parse(fs.readFileSync(ALERTED_FILE, 'utf8'));
    }
    const today = new Date().toISOString().slice(0, 10);
    if (alerted.date !== today) alerted = { date: today, ids: [] };

    try {
        // 1. Fetch Top 150 Symbols
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const topSymbols = res.data
            .filter((t: any) => t.symbol.endsWith('USDT'))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 450)
            .map((t: any) => ({
                symbol: t.symbol.replace('USDT', ''),
                price: parseFloat(t.lastPrice),
                change: parseFloat(t.priceChangePercent)
            }));

        console.log(`[SignalBot] Processing ${topSymbols.length} symbols...`);

        for (const t of topSymbols) {
            if (alerted.ids.includes(t.symbol)) continue;

            const vwap = await fetchWeeklyVwapData(t.symbol);
            if (!vwap) continue;

            // ─── STRICT 6-POINT GOLDEN CHECK (v7 Port) ───
            const lastClose = vwap.last15mClose;
            const prevClose = vwap.prev15mClose;
            const cond1 = lastClose > vwap.prevWeekVwap;
            const cond2 = lastClose > vwap.currentWeekVwap;
            const cond3 = lastClose > vwap.max;
            const cond4 = vwap.currentWeekVwap > vwap.prevWeekVwap && vwap.prevWeekVwap > 0;
            const volatility = (Math.abs(vwap.max - vwap.min) / lastClose);
            const cond5 = volatility > 0.02;
            const cond6 = lastClose > vwap.max && prevClose <= vwap.max;

            // 💎 DIAMOND FILTER: Current Week VWAP must be above Weekly Max (Explosive Momentum)
            const cond7 = vwap.currentWeekVwap > vwap.max;

            const isGolden = cond1 && cond2 && cond3 && cond4 && cond5 && cond6;

            // --- Catch-up Entry Logic ---
            // If we missed the exact cross (cond6), but we ARE above max and WERE below max in the last 4 candles (1 hour)
            const wasBelowRecently = vwap.history15m.slice(-5, -1).some(price => price <= vwap.max);
            const isCatchUp = cond1 && cond2 && cond3 && cond4 && cond5 && wasBelowRecently;

            const isDiamond = isGolden && cond7;

            if (isGolden || isCatchUp) {
                const entryType = isGolden ? (isDiamond ? 'Diamond' : 'Golden') : 'Catch-up';
                console.log(`[SignalBot] 🏆 ${entryType} SIGNAL: ${t.symbol}`);

                // ─── Register in Compound Terminal with strategy tag ───
                registerNewHunt(t.symbol + "USDT", lastClose, 'golden_signal');

                const message = [
                    isDiamond ? `💎 <b>⚡ DIAMOND BREAKOUT (v7 Turbo)</b>` : `🏆 <b>⚡ GOLDEN SIGNAL (24/7 Bot)</b>`,
                    ``,
                    `<b>Token:</b> ${t.symbol}/USDT`,
                    `<b>Price:</b> $${lastClose.toLocaleString()}`,
                    `<b>24h Change:</b> ${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%`,
                    ``,
                    `<b>VWAP Levels:</b>`,
                    `  🟢 Target (Max): $${vwap.max.toLocaleString()}`,
                    `  🔴 Stop (Mid): $${vwap.mid.toLocaleString()}`,
                    ``,
                    `<b>AI Verdict:</b> [v7-Server] Confirmed ${isDiamond ? 'Diamond' : '6-point'} breakout. Price cleared structural levels with ${(volatility * 100).toFixed(1)}% volatility.`,
                    ``,
                    `📊 <a href="https://dexpulse-boosted-dashboard.vercel.app">Open Dashboard</a>`
                ].join('\n');

                await sendTelegram(config, message);
                alerted.ids.push(t.symbol);
                fs.writeFileSync(ALERTED_FILE, JSON.stringify(alerted));
            }

            // Sleep slightly to avoid rate limits
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`[SignalBot] ✅ Scan completed. Next run in 10 minutes.`);
    } catch (err: any) {
        console.error(`[SignalBot] Fatal Error during scan:`, err.message);
    }
}
