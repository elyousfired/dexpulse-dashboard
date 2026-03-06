
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
}

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

                // Check for exit
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

export function registerNewHunt(symbol: string, entryPrice: number, strategyId: string = 'golden_signal') {
    try {
        const hunts: ActiveHunt[] = fs.existsSync(HUNTS_FILE) ? JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8')) : [];

        // Prevent duplicates for the same strategy
        if (hunts.find(h => h.symbol === symbol && h.status === 'active' && h.strategyId === strategyId)) {
            return;
        }

        const newHunt: ActiveHunt = {
            symbol,
            entryPrice,
            entryTime: new Date().toISOString(),
            peakPrice: entryPrice,
            status: 'active',
            capital: 10.0, // Default starting capital
            strategyId
        };

        hunts.push(newHunt);
        fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        console.log(`[StrategyTracker] 💎 REGISTERED NEW HUNT: ${symbol} at ${entryPrice}`);
    } catch (err: any) {
        console.error('[StrategyTracker] Registration Error:', err.message);
    }
}
