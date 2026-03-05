
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

                const currentProfitPct = (hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice;

                // Tiered Trailing Logic
                let trailDist = 0.05;
                let newTier = 1;

                if (currentProfitPct >= 0.30) {
                    trailDist = 0.12;
                    newTier = 3;
                } else if (currentProfitPct >= 0.10) {
                    trailDist = 0.07;
                    newTier = 2;
                }

                // Alert on Tier Change
                if (newTier > (hunt.tier || 1)) {
                    console.log(`[StrategyTracker] 🆙 ${hunt.symbol} upgraded to Tier ${newTier} (on 15m Close)`);
                    await sendTelegram([
                        `💎 <b>COMPOUND ALERT: TIER ${newTier}</b>`,
                        ``,
                        `<b>Symbol:</b> #${hunt.symbol}`,
                        `<b>Confirmed Max Close:</b> +${(currentProfitPct * 100).toFixed(2)}%`,
                        `<b>New Trail:</b> ${(trailDist * 100).toFixed(0)}%`,
                        ``,
                        `<i>Hunting for the Moon... 🚀</i>`
                    ].join('\n'));
                }

                hunt.tier = newTier;

                const stopPrice = hunt.peakPrice * (1 - trailDist);
                const hardStopLoss = hunt.entryPrice * 0.95;

                // Check for exit
                if (decisionPrice <= stopPrice || decisionPrice <= hardStopLoss) {
                    hunt.status = 'closed';
                    hunt.exitPrice = decisionPrice;
                    hunt.exitTime = new Date().toISOString();
                    const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                    hunt.pnl = finalPnl;

                    const reason = decisionPrice <= hardStopLoss ? 'Stop Loss (15m Close)' : `Trailing (15m Close)`;

                    await sendTelegram([
                        `🔴 <b>HUNT CLOSED: #${hunt.symbol}</b>`,
                        ``,
                        `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
                        `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()}`,
                        `<b>Reason:</b> ${reason}`,
                        ``,
                        `💰 Compounding capital reinvested.`
                    ].join('\n'));

                    console.log(`[StrategyTracker] 🔴 CLOSED ${hunt.symbol} | PnL: ${finalPnl.toFixed(2)}% (Confirmed 15m Close)`);
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

export function registerNewHunt(symbol: string, entryPrice: number) {
    try {
        const hunts: ActiveHunt[] = fs.existsSync(HUNTS_FILE) ? JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8')) : [];

        // Prevent duplicates
        if (hunts.find(h => h.symbol === symbol && h.status === 'active')) {
            return;
        }

        const newHunt: ActiveHunt = {
            symbol,
            entryPrice,
            entryTime: new Date().toISOString(),
            peakPrice: entryPrice,
            status: 'active',
            capital: 10.0 // Default starting capital
        };

        hunts.push(newHunt);
        fs.writeFileSync(HUNTS_FILE, JSON.stringify(hunts, null, 2));
        console.log(`[StrategyTracker] 💎 REGISTERED NEW HUNT: ${symbol} at ${entryPrice}`);
    } catch (err: any) {
        console.error('[StrategyTracker] Registration Error:', err.message);
    }
}
