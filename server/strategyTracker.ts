
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

        // Optimized Binance fetch: Only fetch symbols we are tracking
        const symbolsParam = JSON.stringify(active.map(h => h.symbol));
        const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`;

        const { data: tickerData } = await axios.get(url, { timeout: 10000 });

        const priceMap = new Map();
        if (Array.isArray(tickerData)) {
            tickerData.forEach((t: any) => priceMap.set(t.symbol, parseFloat(t.price)));
        } else {
            // If only one symbol, Binance might return an object
            priceMap.set(tickerData.symbol, parseFloat(tickerData.price));
        }

        let modified = false;

        for (const hunt of active) {
            const currentPrice = priceMap.get(hunt.symbol);
            if (!currentPrice) continue;

            // Update Peak
            if (currentPrice > hunt.peakPrice) {
                hunt.peakPrice = currentPrice;
                modified = true;
            }

            const currentProfitPct = (hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice;

            // Tiered Trailing Logic
            let trailDist = 0.05; // Tier 1: 5% (Initial)
            let newTier = 1;

            if (currentProfitPct >= 0.30) {
                trailDist = 0.12; // Tier 3: 12% (Moon Shot)
                newTier = 3;
            } else if (currentProfitPct >= 0.10) {
                trailDist = 0.07; // Tier 2: 7% (Growth)
                newTier = 2;
            }

            // Alert on Tier Change
            if (newTier > (hunt.tier || 1)) {
                console.log(`[StrategyTracker] 🆙 ${hunt.symbol} upgraded to Tier ${newTier}`);
                await sendTelegram([
                    `💎 <b>COMPOUND ALERT: TIER ${newTier}</b>`,
                    ``,
                    `<b>Symbol:</b> #${hunt.symbol}`,
                    `<b>Current Max:</b> +${(currentProfitPct * 100).toFixed(2)}%`,
                    `<b>New Trail:</b> ${(trailDist * 100).toFixed(0)}%`,
                    ``,
                    `<i>Hunting for the Moon... 🚀</i>`
                ].join('\n'));
            }

            hunt.tier = newTier;

            const stopPrice = hunt.peakPrice * (1 - trailDist);
            const hardStopLoss = hunt.entryPrice * 0.95; // Hard 5% SL

            // Check for exit
            if (currentPrice <= stopPrice || currentPrice <= hardStopLoss) {
                hunt.status = 'closed';
                hunt.exitPrice = currentPrice;
                hunt.exitTime = new Date().toISOString();
                const finalPnl = ((hunt.exitPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                hunt.pnl = finalPnl;
                modified = true;

                const reason = currentPrice <= hardStopLoss ? 'Stop Loss' : `Trailing (${(trailDist * 100).toFixed(0)}%)`;

                await sendTelegram([
                    `🔴 <b>HUNT CLOSED: #${hunt.symbol}</b>`,
                    ``,
                    `<b>PNL:</b> ${finalPnl >= 0 ? '+' : ''}${finalPnl.toFixed(2)}%`,
                    `<b>Exit Price:</b> $${hunt.exitPrice.toLocaleString()}`,
                    `<b>Reason:</b> ${reason}`,
                    ``,
                    `💰 Compounding capital reinvested.`
                ].join('\n'));

                console.log(`[StrategyTracker] 🔴 CLOSED ${hunt.symbol} | PnL: ${finalPnl.toFixed(2)}%`);
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
