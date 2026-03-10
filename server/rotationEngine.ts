
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
        const res = await axios.get(url, { timeout: 10000 });
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

        if (wMax === -Infinity) {
            wMax = currentMid;
            wMin = currentMid;
        }
        vwapCache.set(symbol, { wMax, wMin, currentMid, expires: now + CACHE_DURATION });
    }

    const klines15m = await fetchBinanceKlines(symbol, '15m', 2);
    if (klines15m.length < 1) return null;
    const lastClose = klines15m[klines15m.length - 1].close;

    return { max: wMax, min: wMin, mid: currentMid, last15mClose: lastClose };
}



async function sendRotationAlert(text: string) {
    if (!fs.existsSync(CONFIG_FILE)) return;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
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
            console.error(`[RotationEngine] Telegram Error:`, err.message);
        }
    }
}

export async function runRotationEngine() {
    if (isScanning) return;
    isScanning = true;
    console.log(`[RotationEngine] 🛰️ Cycle Start: Initiating Top 300 Scan...`);

    try {
        // 1. Fetch Top 300 Volume USDT Pairs
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 15000 });
        const topSymbols = res.data
            .filter((t: any) => t.symbol.endsWith('USDT'))
            .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, 300) // Increased to 300 to catch mid-caps like MBOX
            .map((t: any) => t.symbol);

        const MAX_SLOTS = 3;

        let currentActive: ActiveHunt[] = [];
        try {
            if (fs.existsSync(HUNTS_FILE)) {
                const content = fs.readFileSync(HUNTS_FILE, 'utf8').trim();
                currentActive = content ? JSON.parse(content) : [];
            }
        } catch (e) {
            console.error(`[RotationEngine] Warning: Failed to parse hunts file, using empty list.`);
            currentActive = [];
        }
        const rotationActive = currentActive.filter((h: ActiveHunt) => h.status === 'active' && h.strategyId === 'golden_rotation');

        // Identify Stagnant Slots (v36)
        const STAGNATION_MIN_AGE_MS = 60 * 60 * 1000;
        const stagnantSlots = rotationActive.filter(h => {
            const ageMs = Date.now() - new Date(h.entryTime).getTime();
            const current = h.currentPrice || h.entryPrice;
            const pnl = ((current - h.entryPrice) / h.entryPrice) * 100;
            return ageMs >= STAGNATION_MIN_AGE_MS && pnl >= 0.1 && pnl <= 1.0;
        });

        console.log(`[RotationEngine] 📡 Scanning ${topSymbols.length} pairs. Active slots: ${rotationActive.length}/${MAX_SLOTS} (${stagnantSlots.length} stagnant)`);

        if (rotationActive.length > 0) {
            const totalPnL = rotationActive.reduce((acc, h) => {
                const current = h.currentPrice || h.entryPrice;
                const pnl = h.pnl ?? ((current - h.entryPrice) / h.entryPrice) * 100;
                return acc + pnl;
            }, 0);

            const bestPnL = Math.max(...rotationActive.map(h => {
                const current = h.currentPrice || h.entryPrice;
                return h.pnl ?? ((current - h.entryPrice) / h.entryPrice) * 100;
            }));

            const worstPnL = Math.min(...rotationActive.map(h => {
                const current = h.currentPrice || h.entryPrice;
                return ((current - h.entryPrice) / h.entryPrice) * 100;
            }));

            // TUNE v34: Dynamic Target Calculation
            const dynamicTarget = Math.min(bestPnL * 0.8, 8.0);

            const isBasketExit = totalPnL >= dynamicTarget && totalPnL > 0;
            const isStrongRunner = bestPnL >= 8.0;
            const isCapitalProtection = Math.abs(totalPnL) <= 0.5 && worstPnL <= -2.0 && rotationActive.length >= 2;

            if (isBasketExit || isStrongRunner || isCapitalProtection) {
                let reason = "";
                if (isBasketExit) reason = `Dynamic Basket Target (+${totalPnL.toFixed(2)}% vs ${dynamicTarget.toFixed(2)}% target)`;
                else if (isStrongRunner) reason = `Strong Runner Exit (Top Token at +${bestPnL.toFixed(2)}%)`;
                else reason = `Capital Protection (Washing Loser ${worstPnL.toFixed(2)}% at breakeven)`;

                console.log(`[RotationEngine] 🧺 ${reason.toUpperCase()}. Closing all ${rotationActive.length} slots.`);

                const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
                const symbolsToClose = rotationActive.map(h => h.symbol);

                hunts.forEach((h: any) => {
                    if (symbolsToClose.includes(h.symbol) && h.strategyId === 'golden_rotation' && h.status === 'active') {
                        h.status = 'closed';
                        h.exitPrice = h.currentPrice || h.entryPrice;
                        h.exitTime = new Date().toISOString();
                        h.pnl = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100;
                        h.reason = reason;
                    }
                });
                fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));

                // Notify Telegram
                await sendRotationAlert([
                    `🧺 <b>BASKET ${isBasketExit || isStrongRunner ? 'PROFIT TAKEN' : 'PROTECTED'}</b>`,
                    ``,
                    `<b>Reason:</b> ${reason}`,
                    `<b>Total PnL:</b> ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}%`,
                    `<b>Best Token:</b> +${bestPnL.toFixed(2)}%`,
                    `<b>Slots Cleared:</b> ${rotationActive.length}`,
                    ``,
                    `🛰️ <i>Ready for fresh candidates...</i>`
                ].join('\n'));

                isScanning = false;
                return; // Cycle fresh
            }
        }

        console.log(`[RotationEngine] Checking ${rotationActive.length}/${MAX_SLOTS} active slots...`);

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
        const candidates: { symbol: string, price: number, density: number }[] = [];
        const STABLECOINS = [
            'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USTC',
            'EUR', 'GBP', 'JPY', 'USDP', 'GUSD', 'PYUSD', 'AEUR', 'ZUSD'
        ];
        let currentOpenCount = rotationActive.length - toClose.length;
        const availableOpenings = MAX_SLOTS - currentOpenCount;
        const totalPotentialOpenings = availableOpenings + stagnantSlots.length;

        // TUNE v33: Log every cycle to show we are alive
        console.log(`[RotationEngine] 📡 Slot check: ${currentOpenCount}/${MAX_SLOTS} used. Potential openings: ${totalPotentialOpenings}. Beginning scan...`);

        if (totalPotentialOpenings > 0) {
            console.log(`[RotationEngine] Scanning top ${topSymbols.length} pairs...`);

            // Get all historical hunts for cooldown check
            const allHunts: ActiveHunt[] = currentActive;

            for (const symbol of topSymbols) {
                if (candidates.length >= totalPotentialOpenings) break;

                // SPECIAL LOG FOR TARGETS
                if (['MBOXUSDT', 'DEXEUSDT'].includes(symbol)) {
                    console.log(`[RotationEngine] 🕵️ Investigating target: ${symbol}`);
                }

                // A. Filter Stablecoins & Pegged Assets (Corrected v33)
                const isStable = STABLECOINS.some(s => symbol.startsWith(s));
                if (isStable) {
                    continue;
                }

                // B. Already active in ANY strategy?
                if (allHunts.find((h: any) => h.symbol === symbol && h.status === 'active')) {
                    if (['MBOXUSDT', 'DEXEUSDT', 'MBOX', 'DEXE'].includes(symbol)) console.log(`[RotationEngine] ❌ ${symbol} skipped: Already active in strategy.`);
                    continue;
                }

                // C. RE-ENTRY COOL-DOWN (4h)
                // If we lost money on this coin in the last 4 hours, skip it.
                const recentLoss = allHunts.find((h: any) =>
                    h.symbol === symbol &&
                    h.status === 'closed' &&
                    h.pnl < 0 &&
                    (new Date().getTime() - new Date(h.exitTime).getTime()) < (4 * 60 * 60 * 1000)
                );
                if (recentLoss) {
                    if (['MBOXUSDT', 'DEXEUSDT', 'MBOX', 'DEXE'].includes(symbol)) console.log(`[RotationEngine] ❌ ${symbol} skipped: Cooldown (Recent Loss).`);
                    continue;
                }

                const vwap = await getVwapData(symbol);
                if (!vwap) {
                    if (['MBOXUSDT', 'DEXEUSDT', 'MBOX', 'DEXE'].includes(symbol)) console.log(`[RotationEngine] ❌ ${symbol} skipped: Failed to fetch VWAP/Kline data.`);
                    continue;
                }

                // --- STRUCTURAL ENTRY LOGIC (v39 REFINE) ---
                const now = new Date();
                const dayOfWeek = now.getUTCDay(); // 1=Mon, 2=Tue
                const isEarlyWeek = dayOfWeek === 1 || dayOfWeek === 2;

                // 1. Structure Check: Daily VWAP (mid) must be the highest, leading the Weekly Max
                // TUNE v40: Allow Max == Min on Mon/Tue to capture early week breakouts
                const isStructuralSignal = isEarlyWeek
                    ? (vwap.mid > vwap.max && vwap.max >= vwap.min)
                    : (vwap.mid > vwap.max && vwap.max > vwap.min);

                // 2. Breakout Confirmation: Price must be above the highest of the three (mid)
                const isPriceBreakout = vwap.last15mClose > vwap.mid;

                // 3. Distance Check (Purity): Not more than 5% above the breakout level (mid)
                const distFromEntry = (vwap.last15mClose - vwap.mid) / vwap.mid;
                const MAX_DISTANCE_PCT = 0.05;

                // 4. Weekly Purity: On Mondays, ensure we are at least 0.5% above Daily VWAP to confirm breakout
                const isMonday = now.getUTCDay() === 1;
                const isLateMonday = isMonday && now.getUTCHours() >= 12;
                const dailyPurityBuffer = isLateMonday ? 1.005 : (isMonday ? 1.002 : 1.0);
                const isPure = vwap.last15mClose >= (vwap.mid * dailyPurityBuffer);

                // --- DENSITY SQUEEZE (SMART FEATURE) ---
                const vwapValues = [vwap.max, vwap.mid, vwap.min];
                const avgVwap = vwapValues.reduce((a, b) => a + b, 0) / 3;
                const avgDiffPct = vwapValues.reduce((acc, v) => acc + (Math.abs(v - avgVwap) / avgVwap), 0) / 3;
                const densityScore = Math.max(0, 100 * (1 - (avgDiffPct / 0.02)));

                // Trigger Condition (v39)
                if (isStructuralSignal && isPriceBreakout && isPure && distFromEntry <= MAX_DISTANCE_PCT) {
                    const isSqueeze = densityScore >= 80;
                    console.log(`[RotationEngine] 🛰️ Found ${isSqueeze ? 'HIGH CONVICTION' : 'CANDIDATE'}: ${symbol} (Dist: ${(distFromEntry * 100).toFixed(2)}%, Density: ${densityScore}%)`);
                    candidates.push({ symbol, price: vwap.last15mClose, density: Math.round(densityScore) });
                } else {
                    // DETAILED DEBUG LOGGING
                    const isTarget = ['MBOXUSDT', 'DEXEUSDT', 'MBOX', 'DEXE'].includes(symbol);
                    if (isTarget || (distFromEntry > 0 && distFromEntry < 0.1)) {
                        let reason = "";
                        if (!isStructuralSignal) reason = `Structure Failure (Mid:${vwap.mid.toFixed(2)} Max:${vwap.max.toFixed(2)} Min:${vwap.min.toFixed(2)})`;
                        else if (!isPriceBreakout) reason = `Price below Mid Breakout (${vwap.last15mClose.toFixed(2)} < ${vwap.mid.toFixed(2)})`;
                        else if (!isPure) reason = `Low Purity (Monday Buffer)`;
                        else if (distFromEntry > MAX_DISTANCE_PCT) reason = `Overextended (+${(distFromEntry * 100).toFixed(2)}%)`;

                        if (reason) {
                            console.log(`[RotationEngine] 🔍 ${symbol} skipped: ${reason}`);
                        }
                    }
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
                    h.exitPrice = h.currentPrice || h.entryPrice;
                    h.exitTime = new Date().toISOString();
                    h.pnl = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100;
                    h.reason = 'Lost Full Long Status (Rotation Swapped Out)';
                    console.log(`[RotationEngine] 💸 CLOSED ${h.symbol} (Rotation Exit) | PnL: ${h.pnl.toFixed(2)}%`);
                }
            });
            fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        }

        // 5. Apply Entries (with Swapping v36)
        for (const cand of (candidates as any[])) {
            if (currentOpenCount >= MAX_SLOTS) {
                const targetToSwap = stagnantSlots.shift();
                if (targetToSwap) {
                    console.log(`[RotationEngine] ♻️ Stagnation Swap: Exiting ${targetToSwap.symbol} for ${cand.symbol}`);
                    const hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
                    hunts.forEach((h: any) => {
                        if (h.symbol === targetToSwap.symbol && h.strategyId === 'golden_rotation' && h.status === 'active') {
                            h.status = 'closed';
                            h.exitPrice = h.currentPrice || h.entryPrice;
                            h.exitTime = new Date().toISOString();
                            h.pnl = ((h.exitPrice - h.entryPrice) / h.entryPrice) * 100;
                            h.reason = 'Stagnation Swap (Opportunity Cost)';
                        }
                    });
                    fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));

                    const oldPnL = (((targetToSwap.currentPrice || targetToSwap.entryPrice) - targetToSwap.entryPrice) / targetToSwap.entryPrice) * 100;

                    await sendRotationAlert([
                        `♻️ <b>STAGNATION SWAP: #${targetToSwap.symbol} ➔ #${cand.symbol}</b>`,
                        ``,
                        `<b>Reason:</b> Opportunity Cost (1H+ Stagnation)`,
                        `<b>Old PnL:</b> +${oldPnL.toFixed(2)}%`,
                        ``,
                        `🛰️ <i>Rotating into faster momentum...</i>`
                    ].join('\n'));
                    currentOpenCount--;
                }
            }
            console.log(`[RotationEngine] 🛰️ Rotating Capital into: ${cand.symbol}`);
            registerNewHunt(cand.symbol, cand.price, 'golden_rotation', cand.density);
            currentOpenCount++;
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
