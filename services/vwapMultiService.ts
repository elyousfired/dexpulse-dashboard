
import { CexTicker, OHLCV } from '../types';
import { fetchBinanceKlines } from './cexService';

export const TIMEFRAMES = [
    { key: 'weekly', label: 'Weekly', interval: '1h', anchored: 'week' as const },
    { key: '1d', label: '1D', interval: '1h', anchored: 'day' as const },
    { key: '4h', label: '4H', interval: '15m', limit: 32 },
    { key: '1h', label: '1H', interval: '5m', limit: 24 },
    { key: '30m', label: '30M', interval: '5m', limit: 12 },
    { key: '15m', label: '15M', interval: '1m', limit: 15 }
];

export interface VwapLevel {
    timeframe: string;
    vwap: number;
    priceVsVwap: number;
    isAbove: boolean;
}

export interface TokenVwapProfile {
    symbol: string;
    price: number;
    change24h: number;
    levels: VwapLevel[];
    aboveCount: number;
}

export async function fetchTokenVwapProfile(symbol: string, currentPrice: number, change24h: number): Promise<TokenVwapProfile | null> {
    const levels: VwapLevel[] = [];
    let aboveCount = 0;

    for (const tf of TIMEFRAMES) {
        try {
            const klines = await fetchBinanceKlines(symbol, tf.interval, (tf as any).limit || 100);
            if (klines.length === 0) continue;

            let cumulativePV = 0;
            let cumulativeV = 0;

            klines.forEach(k => {
                const typicalPrice = (k.high + k.low + k.close) / 3;
                cumulativePV += typicalPrice * k.volume;
                cumulativeV += k.volume;
            });

            const vwap = cumulativePV / cumulativeV;
            const isAbove = currentPrice > vwap;
            if (isAbove) aboveCount++;

            levels.push({
                timeframe: tf.key,
                vwap,
                priceVsVwap: ((currentPrice - vwap) / vwap) * 100,
                isAbove
            });
        } catch (e) {
            console.warn(`Failed to fetch ${tf.key} VWAP for ${symbol}`);
        }
    }

    if (levels.length === 0) return null;

    return {
        symbol,
        price: currentPrice,
        change24h,
        levels,
        aboveCount
    };
}
