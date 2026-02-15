
import { fetchBinanceKlines, OHLCV } from './cexService';

/**
 * Multi-Timeframe VWAP Service
 * Computes VWAP for 6 timeframes: Weekly, 1D, 4H, 1H, 30min, 15min
 * VWAP = SUM(Price * Volume) / SUM(Volume)
 */

export interface VwapLevel {
    timeframe: string;
    label: string;
    vwap: number;
    priceVsVwap: number; // % above/below VWAP
    isAbove: boolean;
}

export interface TokenVwapProfile {
    symbol: string;
    price: number;
    change24h: number;
    levels: VwapLevel[];
    aboveCount: number; // how many TFs price is above VWAP
}

// Timeframe configs
const TIMEFRAMES = [
    { key: 'weekly', label: 'Weekly', interval: '1d', limit: 7 },
    { key: '1d', label: '1D', interval: '1h', limit: 24 },
    { key: '4h', label: '4H', interval: '15m', limit: 16 },
    { key: '1h', label: '1H', interval: '5m', limit: 12 },
    { key: '30m', label: '30min', interval: '1m', limit: 30 },
    { key: '15m', label: '15min', interval: '1m', limit: 15 },
];

function computeVwap(klines: OHLCV[]): number {
    if (klines.length === 0) return 0;
    let sumPV = 0;
    let sumV = 0;
    for (const k of klines) {
        const typicalPrice = (k.high + k.low + k.close) / 3;
        const vol = k.quoteVolume || k.volume;
        sumPV += typicalPrice * vol;
        sumV += vol;
    }
    return sumV > 0 ? sumPV / sumV : 0;
}

// Cache
const profileCache: Map<string, { data: TokenVwapProfile; ts: number }> = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

export async function fetchTokenVwapProfile(symbol: string, currentPrice: number, change24h: number): Promise<TokenVwapProfile | null> {
    const cached = profileCache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    try {
        const results = await Promise.all(
            TIMEFRAMES.map(async (tf) => {
                const klines = await fetchBinanceKlines(symbol, tf.interval, tf.limit);
                if (klines.length === 0) return null;
                const vwap = computeVwap(klines);
                const pctDiff = ((currentPrice - vwap) / vwap) * 100;
                return {
                    timeframe: tf.key,
                    label: tf.label,
                    vwap,
                    priceVsVwap: pctDiff,
                    isAbove: currentPrice > vwap,
                } as VwapLevel;
            })
        );

        const levels = results.filter((r): r is VwapLevel => r !== null);
        const profile: TokenVwapProfile = {
            symbol,
            price: currentPrice,
            change24h,
            levels,
            aboveCount: levels.filter(l => l.isAbove).length,
        };

        profileCache.set(symbol, { data: profile, ts: Date.now() });
        return profile;
    } catch (err) {
        console.error(`VWAP profile error (${symbol}):`, err);
        return null;
    }
}

export { TIMEFRAMES };
