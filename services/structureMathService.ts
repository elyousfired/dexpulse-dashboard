
import { OHLCV } from '../types';

export interface PivotPoint {
    time: number;
    price: number;
    type: 'high' | 'low';
    index: number;
}

export interface StructuralMarker {
    time: number;
    price: number;
    label: 'HH' | 'HL' | 'LH' | 'LL' | 'BOS' | 'CHoCH';
}

export interface StructureResult {
    symbol: string;
    timeframe: string;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    markers: StructuralMarker[];
    score: number; // 0-100 strength
    lastUpdated: number;
}

/**
 * Finds local peaks and troughs in a series of candles.
 * A pivot is confirmed if it is the extrema within a window of size 2*radius + 1.
 */
export function findPivots(candles: OHLCV[], radius: number = 3): PivotPoint[] {
    const pivots: PivotPoint[] = [];

    for (let i = radius; i < candles.length - radius; i++) {
        const current = candles[i];
        let isHigh = true;
        let isLow = true;

        for (let j = i - radius; j <= i + radius; j++) {
            if (i === j) continue;
            if (candles[j].high > current.high) isHigh = false;
            if (candles[j].low < current.low) isLow = false;
        }

        if (isHigh) {
            pivots.push({ time: current.time, price: current.high, type: 'high', index: i });
        } else if (isLow) {
            pivots.push({ time: current.time, price: current.low, type: 'low', index: i });
        }
    }

    return pivots;
}

/**
 * Analyzes pivots to find HH-HL / LH-LL sequences.
 */
export function analyzeBullishStructure(pivots: PivotPoint[]): { markers: StructuralMarker[], trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL', score: number } {
    const markers: StructuralMarker[] = [];
    let lastHigh: PivotPoint | null = null;
    let lastLow: PivotPoint | null = null;
    let streak = 0;

    // Filter to get only the latest significant pivots
    const recentPivots = pivots.slice(-15);

    recentPivots.forEach((p, idx) => {
        if (p.type === 'high') {
            if (lastHigh) {
                if (p.price > lastHigh.price) {
                    markers.push({ time: p.time, price: p.price, label: 'HH' });
                    streak++;
                } else {
                    markers.push({ time: p.time, price: p.price, label: 'LH' });
                    streak = Math.max(0, streak - 1);
                }
            }
            lastHigh = p;
        } else {
            if (lastLow) {
                if (p.price > lastLow.price) {
                    markers.push({ time: p.time, price: p.price, label: 'HL' });
                    streak++;
                } else {
                    markers.push({ time: p.time, price: p.price, label: 'LL' });
                    streak = Math.max(0, streak - 1);
                }
            }
            lastLow = p;
        }
    });

    const score = Math.min(100, streak * 20);
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

    if (score >= 60) trend = 'BULLISH';
    else if (score === 0 && markers.some(m => m.label === 'LL')) trend = 'BEARISH';

    return { markers, trend, score };
}
