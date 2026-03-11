
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');
const CONFIG_FILE = path.join(process.cwd(), 'server', 'bot_config.json');

export interface ActiveHunt {
    symbol: string;
    entryPrice: number;
    entryTime: string;
    peakPrice: number;
    currentPrice?: number;
    status: 'active' | 'closed';
    exitPrice?: number;
    exitTime?: string;
    pnl?: number;
    capital: number;
    tier?: number;
    strategyId?: string;
    density?: number;
    lastVwapAnchor?: number;
}

// ─── v54 Hardcoded Force Reset ───────────────────
const RESET_KEY = "v54_reset_final"; // Change this to trigger a new wipe

(function autoMigrateV54() {
    try {
        console.log(`[StrategyTracker] 🛰️ Checking V5.4 Reset Status (${RESET_KEY})...`);
        
        let config: any = { totalBalance: 100.0, enabled: true };
        if (fs.existsSync(CONFIG_FILE)) {
            config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }

        // If the current reset key hasn't been applied, force a wipe
        if (config.lastResetKey !== RESET_KEY) {
            console.log(`[StrategyTracker] 🛠️ GLOBAL WIPE TRIGGERED (${RESET_KEY}): Wiping history and resetting balance to $100...`);
            
            config.totalBalance = 100.0;
            config.lastResetKey = RESET_KEY;
            
            // Hard Wipe config
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
            
            // Hard Wipe Hunts
            fs.writeFileSync(HUNTS_FILE, JSON.stringify([], null, 2));
            
            console.log("[StrategyTracker] ✅ Global Reset Complete. Starting fresh from $100.");
        } else {
            console.log(`[StrategyTracker] 🛰️ V5.4 Reset already applied. Balance: $${config.totalBalance}`);
        }
    } catch (e) {
        console.error("[StrategyTracker] Migration Error:", e);
    }
})();

// ─── v50 Self-Healing Migration ───────────────────
// Since data files are gitignored, we force a reset if totalBalance is missing
(function autoMigrateV50() {
    try {
        console.log("[StrategyTracker] 🛰️ Checking V5.0 Migration Status...");
        if (!fs.existsSync(CONFIG_FILE)) {
            console.log("[StrategyTracker] 🛠️ No config found. Creating initial v5.0 config...");
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ totalBalance: 100.0, enabled: true }, null, 2));
            return;
        }

        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        // Check for special reset flag or missing totalBalance
        if (config.totalBalance === undefined || config.forceResetV50) {
            console.log("[StrategyTracker] 🛠️ v5.0 Reset Triggered: Initializing balance ($100) and wiping history...");
            config.totalBalance = 100.0;
            delete config.forceResetV50; // Remove flag if present
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

            // Hard Wipe Hunts
            fs.writeFileSync(HUNTS_FILE, JSON.stringify([], null, 2));
            console.log("[StrategyTracker] ✅ Reset Complete. Starting fresh from $100.");
        } else {
            console.log(`[StrategyTracker] 🛰️ V5.0 Active. Current Balance: $${config.totalBalance}`);
        }
    } catch (e) {
        console.error("[StrategyTracker] Migration Error:", e);
    }
})();

async function sendTelegram(text: string) {
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
            console.error(`[Tracker] Telegram Error:`, err.message);
        }
    }
}

async function handleEarlyExit(hunt: ActiveHunt, exitPrice: number, strategyName: string, reason: string) {
    hunt.status = 'closed';
    hunt.exitPrice = exitPrice;
    hunt.exitTime = new Date().toISOString();
    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
    hunt.pnl = finalPnl;

    await sendTelegram([
        `🌤️ <b>${strategyName.toUpperCase()} EARLY EXIT: #${hunt.symbol}</b>`,
        ``,
        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()}`,
        `<b>Reason:</b> ${reason}`,
        ``,
        `💰 <i>Profit locked or loss minimized.</i>`
    ].join('\n'));

    // v50: Update Global Balance
    if (fs.existsSync(CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (config.totalBalance !== undefined) {
            const pnlAmount = hunt.capital * (finalPnl / 100);
            config.totalBalance += pnlAmount;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
            console.log(`[StrategyTracker] 💰 Updated Balance: $${config.totalBalance.toFixed(2)} (PnL: $${pnlAmount.toFixed(2)})`);
        }
    }

    console.log(`[StrategyTracker] 🌤️ EARLY EXIT ${hunt.symbol} (${strategyName}) | PnL: ${finalPnl.toFixed(2)}% | Reason: ${reason}`);
}

export async function processActiveHunts() {
    if (!fs.existsSync(HUNTS_FILE)) return;

    try {
        const hunts: ActiveHunt[] = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8'));
        const active = hunts.filter(h => h.status === 'active');
        if (active.length === 0) {
            console.log('[StrategyTracker] No active hunts to track.');
            return;
        }

        console.log(`[StrategyTracker] Updating prices for ${active.length} active symbols: ${active.map(h => h.symbol).join(', ')}`);

        console.log(`[StrategyTracker] Updating prices (15m Candle Close) for ${active.length} symbols...`);

        let modified = false;

        for (const hunt of active) {
            try {
                // Fetch the last 2 candles (current open and last closed)
                const url = `https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=15m&limit=2`;
                const { data: klines } = await axios.get(url, { timeout: 10000 });

                if (!klines || klines.length < 2) continue;

                // klines[0] = last completed candle, klines[1] = current open candle
                const candleClose = parseFloat(klines[0][4]);
                const livePrice = parseFloat(klines[1][4]); // For UI "Live" feel

                hunt.currentPrice = livePrice; // Still update currentPrice for dashboard visual
                modified = true;

                // BUT: Decision-making ONLY on candleClose
                const decisionPrice = candleClose;

                // Update Peak based on Close
                if (decisionPrice > hunt.peakPrice) {
                    hunt.peakPrice = decisionPrice;
                }

                const currentProfitPct = (decisionPrice - hunt.entryPrice) / hunt.entryPrice;
                const peakProfitPct = (hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice;

                // ─── Strategy-Specific Risk Management ───
                let stopPrice = hunt.entryPrice * 0.95; // Default Original: -5%
                let trailDist = 0.05;
                let strategyName = "Golden Signal";

                if (hunt.strategyId === 'golden_pro') {
                    strategyName = "Golden Pro";
                    // 1. Loosened Stop Loss: -8%
                    stopPrice = hunt.entryPrice * 0.92;

                    // 2. Break-Even Trigger: If profit >= +6%, move stop to Entry + 0.5%
                    if (peakProfitPct >= 0.06) {
                        stopPrice = hunt.entryPrice * 1.005;
                    }
                } else if (hunt.strategyId === 'golden_rotation') {
                    strategyName = "Golden Rotation";
                    // Tight rotation stop: -4%
                    stopPrice = hunt.entryPrice * 0.96;
                }

                // Tiered Trailing Logic (Universal for both, based on peak)
                let newTier = 1;
                if (peakProfitPct >= 0.30) {
                    trailDist = 0.12;
                    newTier = 3;
                } else if (hunt.strategyId === 'golden_pro' && peakProfitPct >= 0.15) {
                    trailDist = 0.08;
                    newTier = 2;
                } else if (hunt.strategyId !== 'golden_pro' && peakProfitPct >= 0.10) {
                    trailDist = 0.07;
                    newTier = 2;
                }

                // Update Stop Price if Trailing is more protective
                const trailingStop = hunt.peakPrice * (1 - trailDist);
                if (peakProfitPct >= 0.10 && trailingStop > stopPrice) {
                    stopPrice = trailingStop;
                }

                // --- EMERGENCY HARD STOP (LIVE PRICE CHECK) ---
                // If livePrice (5s update) hits stop level, exit IMMEDIATELY without waiting for candle close
                if (livePrice <= stopPrice) {
                    console.log(`[StrategyTracker] 🚨 EMERGENCY STOP TRIGGERED: ${hunt.symbol} at $${livePrice} (Stop: $${stopPrice})`);

                    hunt.status = 'closed';
                    hunt.exitPrice = livePrice;
                    hunt.exitTime = new Date().toISOString();
                    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                    hunt.pnl = finalPnl;

                    const reason = stopPrice > hunt.entryPrice ? 'Take Profit/BE (Emergency)' : 'Hard Stop-Loss (Emergency)';

                    await sendTelegram([
                        `🚨 <b>${strategyName.toUpperCase()} EMERGENCY EXIT: #${hunt.symbol}</b>`,
                        ``,
                        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
                        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()} (LIVE)`,
                        `<b>Reason:</b> ${reason}`,
                        ``,
                        `🛡️ <i>Instant Protection Activated.</i>`
                    ].join('\n'));

                    // v50: Update Global Balance
                    if (fs.existsSync(CONFIG_FILE)) {
                        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                        if (config.totalBalance !== undefined) {
                            const pnlAmount = hunt.capital * (finalPnl / 100);
                            config.totalBalance += pnlAmount;
                            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
                            console.log(`[StrategyTracker] 💰 Updated Balance: $${config.totalBalance.toFixed(2)} (PnL: $${pnlAmount.toFixed(2)})`);
                        }
                    }

                    console.log(`[StrategyTracker] 🔴 CLOSED ${hunt.symbol} (${strategyName}) | PnL: ${finalPnl.toFixed(2)}%`);
                    continue; // Skip the rest of the loop for this hunt
                }

                // --- MOMENTUM EXHAUSTION GUARD (5m Timeframe) ---
                const url5m = `https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=5m&limit=20`;
                const { data: klines5m } = await axios.get(url5m, { timeout: 10000 });

                let rsi5m = 50;
                if (klines5m && klines5m.length >= 15) {
                    const closes = klines5m.map((k: any) => parseFloat(k[4]));
                    let gains = 0, losses = 0;
                    for (let i = closes.length - 14; i < closes.length; i++) {
                        const diff = closes[i] - closes[i - 1];
                        if (diff >= 0) gains += diff; else losses -= diff;
                    }
                    rsi5m = losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));
                }

                // 1. Peak Reversal (Sliding TP):
                // Rotation: 2.5% Trigger, 1.0% Reversal (Hyper-Scalp)
                // Others: 5.0% Trigger, 1.5% Reversal
                const isRotation = hunt.strategyId === 'golden_rotation';
                const triggerThreshold = isRotation ? 0.025 : 0.05;
                const reversalThreshold = isRotation ? 0.010 : 0.015;

                const reversalDist = (hunt.peakPrice - livePrice) / hunt.peakPrice;
                if (peakProfitPct >= triggerThreshold && reversalDist >= reversalThreshold) {
                    console.log(`[StrategyTracker] 📉 ${isRotation ? 'HYPER-SCALP' : 'PEAK REVERSAL'} DETECTED: ${hunt.symbol} (Dropped ${(reversalDist * 100).toFixed(2)}% from peak)`);
                    await handleEarlyExit(hunt, livePrice, strategyName, isRotation ? 'Hyper-Scalp (Tighter Locking)' : 'Peak Reversal (Sliding TP)');
                    continue;
                }

                // --- AVWAP TREND GUARD (Phase 47) ---
                // For Rotation trades, we follow the slope of the Anchored VWAP from Entry
                if (hunt.strategyId === 'golden_rotation') {
                    try {
                        const entryTs = new Date(hunt.entryTime).getTime();
                        const nowTs = Date.now();
                        const avwapUrl = `https://api.binance.com/api/v3/klines?symbol=${hunt.symbol}&interval=15m&startTime=${entryTs}&limit=1000`;
                        const { data: avwapKlines } = await axios.get(avwapUrl, { timeout: 10000 });

                        if (avwapKlines && avwapKlines.length >= 2) {
                            let totalPV = 0;
                            let totalV = 0;
                            let prevAVWAP = hunt.lastVwapAnchor || 0;
                            let currentAVWAP = 0;

                            // Calculate Current AVWAP
                            for (const k of avwapKlines) {
                                const p = (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3; // Typical Price
                                const v = parseFloat(k[5]);
                                totalPV += p * v;
                                totalV += v;
                            }
                            currentAVWAP = totalV > 0 ? totalPV / totalV : 0;

                            // Trend Exit Logic: If AVWAP turns negative (current < prev)
                            // We wait for at least 3 klines of data to ensure trend stability
                            if (prevAVWAP > 0 && currentAVWAP < prevAVWAP && avwapKlines.length >= 3) {
                                console.log(`[StrategyTracker] 📉 AVWAP DOWNTURN: ${hunt.symbol} (Curr: ${currentAVWAP.toFixed(4)} < Prev: ${prevAVWAP.toFixed(4)})`);
                                await handleEarlyExit(hunt, livePrice, strategyName, `AVWAP Slope Turned Negative`);
                                continue;
                            }

                            hunt.lastVwapAnchor = currentAVWAP;
                        }
                    } catch (e: any) {
                        console.error(`[Tracker] AVWAP Error for ${hunt.symbol}:`, e.message);
                    }
                }

                // 2. RSI Exhaustion: If RSI > 80 and price starts to stall (below previous 5m close)
                const last5mClose = parseFloat(klines5m[klines5m.length - 2][4]);
                if (rsi5m >= 80 && livePrice < last5mClose) {
                    console.log(`[StrategyTracker] 🥵 RSI EXHAUSTION: ${hunt.symbol} (RSI: ${rsi5m.toFixed(1)})`);
                    await handleEarlyExit(hunt, livePrice, strategyName, `RSI Exhaustion (${rsi5m.toFixed(0)})`);
                    continue;
                }

                // Alert on Tier Change
                if (newTier > (hunt.tier || 1)) {
                    console.log(`[StrategyTracker] 🆙 ${hunt.symbol} (${strategyName}) upgraded to Tier ${newTier}`);
                    await sendTelegram([
                        `💎 <b>${strategyName.toUpperCase()} UPGRADE: TIER ${newTier}</b>`,
                        ``,
                        `<b>Symbol:</b> #${hunt.symbol}`,
                        `<b>Peak Profit:</b> +${(peakProfitPct * 100).toFixed(2)}%`,
                        `<b>Stop Level:</b> $${stopPrice.toLocaleString()} (${stopPrice > hunt.entryPrice ? 'PROTECTED' : 'AT RISK'})`,
                        ``,
                        `<i>Hunting for the Moon... 🚀</i>`
                    ].join('\n'));
                }
                hunt.tier = newTier;

                // Check for candle-close exit (secondary check, though emergency usually catches it)
                if (decisionPrice <= stopPrice) {
                    hunt.status = 'closed';
                    hunt.exitPrice = decisionPrice;
                    hunt.exitTime = new Date().toISOString();
                    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                    hunt.pnl = finalPnl;

                    const reason = stopPrice > hunt.entryPrice ? 'Take Profit/BE' : 'Hard Stop Loss';

                    await sendTelegram([
                        `🔴 <b>${strategyName.toUpperCase()} CLOSED: #${hunt.symbol}</b>`,
                        ``,
                        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
                        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()}`,
                        `<b>Reason:</b> ${reason} (15m Close)`,
                        ``,
                        `💰 Rebalancing capital...`
                    ].join('\n'));

                    // v50: Update Global Balance
                    if (fs.existsSync(CONFIG_FILE)) {
                        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                        if (config.totalBalance !== undefined) {
                            const pnlAmount = hunt.capital * (finalPnl / 100);
                            config.totalBalance += pnlAmount;
                            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
                            console.log(`[StrategyTracker] 💰 Updated Balance: $${config.totalBalance.toFixed(2)} (PnL: $${pnlAmount.toFixed(2)})`);
                        }
                    }

                    console.log(`[StrategyTracker] 🔴 CLOSED ${hunt.symbol} (${strategyName}) | PnL: ${finalPnl.toFixed(2)}%`);
                }

                // Small delay to prevent Binance rate limit
                await new Promise(r => setTimeout(r, 200));

            } catch (err: any) {
                console.error(`[Tracker] Error updating ${hunt.symbol}:`, err.message);
            }
        }

        if (modified) {
            fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        }

    } catch (err: any) {
        console.error('[StrategyTracker] Error:', err.message);
    }
}

export function registerNewHunt(symbol: string, entryPrice: number, strategyId: string = 'golden_signal', density?: number) {
    try {
        const hunts: ActiveHunt[] = fs.existsSync(HUNTS_FILE) ? JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8')) : [];

        // Prevent duplicates for the same strategy
        const alreadyActive = hunts.find(h =>
            h.symbol.toUpperCase() === symbol.toUpperCase() &&
            h.status === 'active' &&
            (h.strategyId === strategyId || (!h.strategyId && strategyId === 'golden_signal'))
        );

        if (alreadyActive) return;

        // v50: Calculate Dynamic Capital (Balance / 3)
        let entriesBudget = 10.0;
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (config.totalBalance !== undefined) {
                entriesBudget = Math.floor((config.totalBalance / 3) * 100) / 100; // Divide by 3 slots
            }
        }

        const newHunt: ActiveHunt = {
            symbol,
            entryPrice,
            entryTime: new Date().toISOString(),
            peakPrice: entryPrice,
            status: 'active',
            capital: entriesBudget,
            strategyId,
            density
        };

        hunts.push(newHunt);
        fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        console.log(`[StrategyTracker] 💎 REGISTERED NEW HUNT: ${symbol} at ${entryPrice} (Density: ${density || 0}%)`);

        // Send Entry Alert
        let strategyName = "Golden Signal";
        if (strategyId === 'golden_pro') strategyName = "Golden Pro";
        if (strategyId === 'golden_rotation') strategyName = "Golden Rotation";

        const isSqueeze = (density || 0) >= 80;

        sendTelegram([
            `${isSqueeze ? '🔥' : '💎'} <b>${strategyName.toUpperCase()} ENTRY: #${symbol}</b>`,
            ``,
            `<b>Price:</b> $${entryPrice.toLocaleString()}`,
            density ? `<b>Density Score:</b> ${density}% ${isSqueeze ? '⚡ <i>(SQUEEZE)</i>' : ''}` : '',
            ``,
            isSqueeze
                ? `🚀 <b>SQUEEZE BREAKOUT:</b> Technical squeeze confirmed.`
                : `📈 Trend following initiated.`
        ].filter(Boolean).join('\n'));

    } catch (err: any) {
        console.error('[StrategyTracker] Registration Error:', err.message);
    }
}
