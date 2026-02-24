
import { CexTicker, OHLCV } from '../types';

export type MarketPhase = 'ACCUMULATION' | 'EXPANSION' | 'DISTRIBUTION' | 'SCANNING' | 'UNKNOWN';

export interface SessionData {
    vwap: number;
    volatility: number;
    phase: MarketPhase;
    volumeSpike: boolean;
    distanceToVwap: number;
}

export interface MarketStructure {
    symbol: string;
    asia: SessionData;
    london: SessionData;
    ny: SessionData;
    lastUpdated: number;
}

/**
 * Session Time Windows (UTC)
 */
export const SESSIONS = {
    ASIA: { start: 0, end: 8 },
    LONDON: { start: 8, end: 16 },
    NY: { start: 16, end: 24 }
};

/**
 * Identify the phase of a given set of klines for a specific window
 */
export function analyzeSessionPhase(klines: OHLCV[], sessionStartPrice: number): SessionData {
    if (klines.length === 0) {
        return { vwap: 0, volatility: 0, phase: 'SCANNING', volumeSpike: false, distanceToVwap: 0 };
    }

    let qVol = 0;
    let bVol = 0;
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    let totalVolume = 0;

    klines.forEach(k => {
        qVol += k.quoteVolume || (k.close * k.volume);
        bVol += k.volume;
        if (k.high > maxPrice) maxPrice = k.high;
        if (k.low < minPrice) minPrice = k.low;
        totalVolume += k.volume;
    });

    const vwap = bVol > 0 ? qVol / bVol : klines[klines.length - 1].close;
    const lastPrice = klines[klines.length - 1].close;
    const volatility = ((maxPrice - minPrice) / sessionStartPrice) * 100;
    const distanceToVwap = ((lastPrice - vwap) / vwap) * 100;

    // Simple Volume Spike detection (compared to session average)
    const avgVolume = totalVolume / klines.length;
    const lastVolume = klines[klines.length - 1].volume;
    const volumeSpike = lastVolume > avgVolume * 2.5;

    let phase: MarketPhase = 'ACCUMULATION';

    // 1. EXPANSION: Strong price movement away from VWAP + High Volatility
    if (Math.abs(distanceToVwap) > 1.2 || volatility > 2.5) {
        phase = 'EXPANSION';
    }

    // 2. DISTRIBUTION: Exhaustion (High volatility but price returning to VWAP or distance narrowing)
    // Often happens after an expansion. For simplicity: high volatility but distance is low-ish.
    if (volatility > 3.0 && Math.abs(distanceToVwap) < 0.8) {
        phase = 'DISTRIBUTION';
    }

    // 3. ACCUMULATION: Tight range, low volatility, hugging VWAP
    if (volatility < 1.5 && Math.abs(distanceToVwap) < 0.5) {
        phase = 'ACCUMULATION';
    }

    return { vwap, volatility, phase, volumeSpike, distanceToVwap };
}

export interface Verdict {
    label: string;
    description: string;
    confidence: number;
    color: string;
    isHot: boolean;
}

/**
 * Predict the next likely market bias based on session sequences
 */
export function predictNextBias(asia: SessionData, london: SessionData, ny: SessionData): Verdict {
    const sequence = [asia.phase, london.phase, ny.phase].filter(p => p !== 'SCANNING' && p !== 'UNKNOWN');

    // 1. IGNITION READY (Accumulation -> Accumulation)
    if (sequence.length >= 2 && sequence[0] === 'ACCUMULATION' && sequence[1] === 'ACCUMULATION') {
        return {
            label: 'IGNITION READY',
            description: 'Major institutional coiling detected. Expansion highly probable.',
            confidence: 92,
            color: 'text-orange-400',
            isHot: true
        };
    }

    // 2. TREND CONTINUATION (Accumulation -> Expansion)
    if (sequence.length >= 2 && sequence[0] === 'ACCUMULATION' && sequence[1] === 'EXPANSION') {
        return {
            label: 'CONTINUATION',
            description: 'Breakout phase active. Trend expected to sustain.',
            confidence: 75,
            color: 'text-purple-400',
            isHot: false
        };
    }

    // 3. FLUSH RISK (Distribution -> Distribution)
    if (sequence.length >= 2 && sequence[0] === 'DISTRIBUTION' && sequence[1] === 'DISTRIBUTION') {
        return {
            label: 'FLUSH RISK',
            description: 'Liquidity exhaustion. Strong reversal or drop expected.',
            confidence: 68,
            color: 'text-red-400',
            isHot: true
        };
    }

    // 4. RE-ACCUMULATION (Distribution -> Accumulation)
    if (sequence.length >= 2 && sequence[0] === 'DISTRIBUTION' && sequence[1] === 'ACCUMULATION') {
        return {
            label: 'RE-ACCUM',
            description: 'Selling pressure absorbed. Potential bottom-building.',
            confidence: 80,
            color: 'text-cyan-400',
            isHot: false
        };
    }

    // 5. MEAN REVERSION (Expansion -> Distribution)
    if (sequence.length >= 2 && sequence[0] === 'EXPANSION' && sequence[1] === 'DISTRIBUTION') {
        return {
            label: 'MEAN REVERSION',
            description: 'Trend overextended. Expecting retracement to VWAP.',
            confidence: 72,
            color: 'text-blue-400',
            isHot: false
        };
    }

    return {
        label: 'NEUTRAL',
        description: 'No significant structural sequence detected yet.',
        confidence: 50,
        color: 'text-gray-500',
        isHot: false
    };
}

/**
 * Checks if a timestamp (seconds) falls within a UTC hour range
 */
export function isTimestampInSession(ts: number, startHour: number, endHour: number): boolean {
    const date = new Date(ts * 1000);
    const hour = date.getUTCHours();
    return hour >= startHour && hour < endHour;
}

/**
 * Partition klines into sessions for a specific day
 */
export function partitionKlinesBySession(klines: OHLCV[]) {
    const asia: OHLCV[] = [];
    const london: OHLCV[] = [];
    const ny: OHLCV[] = [];

    klines.forEach(k => {
        const hour = new Date(k.time * 1000).getUTCHours();
        if (hour >= 0 && hour < 8) asia.push(k);
        else if (hour >= 8 && hour < 16) london.push(k);
        else if (hour >= 16 && hour < 24) ny.push(k);
    });

    return { asia, london, ny };
}
