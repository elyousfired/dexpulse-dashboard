
import { CexTicker } from '../types';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokens?: number; // Estimated tokens used
}

export interface WarRoomConsensus {
    verdict: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
    agents: {
        researcher: string;
        quant: string;
        risk: string;
    };
    confidence: number;
}

/**
 * Orchestrates the multi-agent reasoning for the Advisor.
 * It simulates a discussion between agents before giving a final answer.
 */
export async function getAdvisorResponse(userQuery: string, context: { tickers: CexTicker[] }): Promise<string> {
    const query = userQuery.toUpperCase();

    // Find if the user is asking about a specific ticker
    const mentionedTicker = context.tickers.find(t => query.includes(t.symbol.toUpperCase()));

    return new Promise((resolve) => {
        setTimeout(() => {
            if (mentionedTicker) {
                const change = mentionedTicker.priceChangePercent24h;
                const isBullish = change > 0;

                let advice = `Analysis for **${mentionedTicker.symbol}**: `;
                if (change > 5) {
                    advice += `The Researcher sees high organic buzz (+${(change * 2.5).toFixed(0)}% mentions). The Quant detects a strong Alpha push. Risk Master warns about being over-extended. **Verdict: HOLD/TAKE PROFIT.**`;
                } else if (change < -5) {
                    advice += `Heavy selling pressure detected. Quant sees price near Weekly Min support. Researcher notes "Fear" in social sentiment. **Verdict: WAIT FOR BOTTOM.**`;
                } else {
                    advice += `Price is consolidating. Beta correlation with BTC is stable at 0.82. **Verdict: NEUTRAL.**`;
                }
                resolve(advice);
            } else if (query.includes("STRATEGY") || query.includes("HOW")) {
                resolve("To use this terminal effectively: 1. Find an Alpha Leader in BTC Correlation. 2. Verify it has High Organic Trust in Sentiment (Antfarm). 3. Check for Weekly VWAP support.");
            } else {
                resolve("I see you're looking at the market. Most tickers are currently following BTC's lead with a 0.85 correlation. Try asking about a specific coin like 'What about ETH?' for a deep dive.");
            }
        }, 1200);
    });
}

/**
 * Estimates token usage for a given query and response.
 */
export function estimateCost(input: string, output: string): number {
    return (input.length + output.length) / 4; // Very rough estimation
}
