
import { CexTicker } from '../types';

export interface SentimentData {
    score: number;       // 0-100
    socialVolume: number; // relative buzz
    verdict: string;
    botActivity: number;  // 0-100 (probability of fake hype)
    lastUpdate: number;
}

const sentimentCache: Map<string, SentimentData> = new Map();

/**
 * Simulates fetching sentiment from Antfarm's background researcher agents.
 * In a real-world scenario, this would read from a shared bridge file or DB.
 */
export async function fetchAntfarmSentiment(symbol: string): Promise<SentimentData> {
    const cached = sentimentCache.get(symbol);
    if (cached && Date.now() - cached.lastUpdate < 300000) return cached; // 5 min cache

    // Logic: If we don't have real-time data, we simulate it based on symbol hash 
    // to provide consistent but semi-realistic "mock" data for the demo.
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const mockScore = (hash % 60) + 40; // 40-100 range
    const mockBot = (hash * 17) % 30; // 0-30% bot probability

    const data: SentimentData = {
        score: mockScore,
        socialVolume: (hash * 13) % 1000,
        verdict: mockScore > 80 ? "Ultra Bullish Organic Growth" : "Neutral Social Buzz",
        botActivity: mockBot,
        lastUpdate: Date.now()
    };

    sentimentCache.set(symbol, data);
    return data;
}

export function getHybridSignal(ticker: CexTicker, sentiment: SentimentData) {
    const isHighAlpha = ticker.priceChangePercent24h > 5;
    const isHighSentiment = sentiment.score > 75;
    const lowBot = sentiment.botActivity < 15;

    if (isHighAlpha && isHighSentiment && lowBot) return 'SUPER_SIGNAL';
    if (isHighAlpha && sentiment.score < 30) return 'STEALTH_ACCUMULATION';
    if (sentiment.botActivity > 60) return 'BOT_WARNING';
    return 'NEUTRAL';
}
