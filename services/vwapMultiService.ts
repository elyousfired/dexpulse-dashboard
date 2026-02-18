
import { CexTicker, OHLCV } from '../types';
import { fetchBinanceKlines, getMondayStartUTC, getTodayStartUTC } from './cexService';

const TIMEFRAMES = [
    { key: 'weekly', label: 'Weekly', interval: '1h', anchored: 'week' as const },
    { key: '1d', label: '1D', interval: '1h', anchored: 'day' as const },
    { key: '4h', label: '4H', interval: '15m', limit: 16 },
    { key: '1h', label: '1H', interval: '5m', limit: 12 },
    { key: '15m', label: '15M', interval: '1m', limit: 15 }
];

export interface MultiVwapPoint {
    time: number;
    value: number;
}

export interface MultiVwapProfile {
    timeframe: string;
    label: string;
    currentVwap: number;
    data: MultiVwapPoint[];
}

export async function fetchTokenVwapProfile(symbol: string): Promise<MultiVwapProfile[]> {
    const profiles: MultiVwapProfile[] = [];

    for (const tf of TIMEFRAMES) {
        try {
            let klines: OHLCV[] = [];

            if ('anchored' in tf && tf.anchored === 'day') {
                klines = await fetchBinanceKlines(symbol, tf.interval, 100);
            } else if ('anchored' in tf && tf.anchored === 'week') {
                klines = await fetchBinanceKlines(symbol, tf.interval, 200);
            } else {
                klines = await fetchBinanceKlines(symbol, tf.interval, (tf as any).limit || 100);
            }

            if (klines.length === 0) continue;

            const vwapData: MultiVwapPoint[] = [];
            let cumulativePV = 0;
            let cumulativeV = 0;

            klines.forEach(k => {
                const typicalPrice = (k.high + k.low + k.close) / 3;
                cumulativePV += typicalPrice * k.volume;
                cumulativeV += k.volume;
                vwapData.push({
                    time: k.time,
                    value: cumulativePV / cumulativeV
                });
            });

            profiles.push({
                timeframe: tf.key,
                label: tf.label,
                currentVwap: vwapData[vwapData.length - 1].value,
                data: vwapData
            });
        } catch (e) {
            console.warn(`Failed to fetch VWAP for ${tf.label}`, e);
        }
    }

    return profiles;
}
