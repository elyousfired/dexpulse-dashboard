
import { OHLCV } from '../types';

export interface TmaMetrics {
    pdh: number;
    pdl: number;
    pdo: number;
    pdc: number;
    pdr: number;
    mid: number;
    bodySize: number;
    upperWick: number;
    lowerWick: number;
}

export type DayClassification = 'Bullish' | 'Bearish' | 'Compression';

export interface LiquidityZones {
    buySide: [number, number];
    sellSide: [number, number];
    rebalance: [number, number];
}

export interface TmaState {
    metrics: TmaMetrics;
    classification: DayClassification;
    zones: LiquidityZones;
    current: {
        last15mSweep?: 'Buy-Side' | 'Sell-Side';
        acceptance?: 'Above PDH' | 'Below PDL';
        mss?: 'Long' | 'Short';
        bias: 'Bullish' | 'Bearish' | 'Neutral' | 'Reversal Long' | 'Reversal Short';
        confidence: number;
    };
    probabilities: {
        reversal: number;
        continuation: number;
        range: number;
    };
}

export function calculatePDMetrics(yesterday: OHLCV): TmaMetrics {
    const pdh = yesterday.high;
    const pdl = yesterday.low;
    const pdo = yesterday.open;
    const pdc = yesterday.close;
    const pdr = pdh - pdl;
    const mid = (pdh + pdl) / 2;
    const bodySize = Math.abs(pdc - pdo);
    const upperWick = pdh - Math.max(pdo, pdc);
    const lowerWick = Math.min(pdo, pdc) - pdl;

    return { pdh, pdl, pdo, pdc, pdr, mid, bodySize, upperWick, lowerWick };
}

export function classifyDay(metrics: TmaMetrics): DayClassification {
    const { pdc, pdo, bodySize, pdr } = metrics;
    if (bodySize < 0.2 * pdr) return 'Compression';
    return pdc > pdo ? 'Bullish' : 'Bearish';
}

export function calculateLiquidityZones(metrics: TmaMetrics, currentPrice: number): LiquidityZones {
    const { pdh, pdl, mid, pdr } = metrics;
    // Zone size: max(0.2% of current price, 0.15 * ATR estimate) -> using 0.25% fixed for simplicity if ATR unavailable
    const zone_size = Math.max(currentPrice * 0.002, pdr * 0.1);

    return {
        buySide: [pdh, pdh + zone_size],
        sellSide: [pdl - zone_size, pdl],
        rebalance: [mid - (0.1 * pdr), mid + (0.1 * pdr)]
    };
}

export function analyzeIntraday(metrics: TmaMetrics, today15m: OHLCV[]): Partial<TmaState['current']> {
    if (today15m.length === 0) return {};

    const last = today15m[today15m.length - 1];
    const prev = today15m.length > 1 ? today15m[today15m.length - 2] : null;
    const { pdh, pdl } = metrics;

    let sweep: 'Buy-Side' | 'Sell-Side' | undefined;
    let acceptance: 'Above PDH' | 'Below PDL' | undefined;

    // A) Sweep Detection
    if (last.high > pdh && last.close < pdh) sweep = 'Buy-Side';
    if (last.low < pdl && last.close > pdl) sweep = 'Sell-Side';

    // B) Acceptance Detection (2 consecutive closes)
    if (prev && last.close > pdh && prev.close > pdh) acceptance = 'Above PDH';
    if (prev && last.close < pdl && prev.close < pdl) acceptance = 'Below PDL';

    // MSS logic simplified: break of previous 15m high/low after sweep
    let mss: 'Long' | 'Short' | undefined;
    if (sweep === 'Sell-Side' && last.close > (prev?.high || 0)) mss = 'Long';
    if (sweep === 'Buy-Side' && last.close < (prev?.low || 0)) mss = 'Short';

    return { last15mSweep: sweep, acceptance, mss };
}

export function runScenarioEngine(metrics: TmaMetrics, current: Partial<TmaState['current']>, todayKlines: OHLCV[]): TmaState['probabilities'] {
    let reversal = 0;
    let continuation = 0;
    let range = 0;

    const last = todayKlines[todayKlines.length - 1];
    if (!last) return { reversal: 33, continuation: 33, range: 34 };

    // 1. Sweep Logic
    if (current.last15mSweep) reversal += 40;

    // 2. Acceptance Logic
    if (current.acceptance) continuation += 40;

    // 3. Inside Range Logic
    if (last.close > metrics.pdl && last.close < metrics.pdh) range += 30;

    // 4. Volume Spike
    const avgVol = todayKlines.reduce((acc, k) => acc + k.volume, 0) / todayKlines.length;
    if (last.volume > avgVol * 1.5) {
        if (current.acceptance) continuation += 20;
        if (current.last15mSweep) reversal += 20;
    }

    // Edge Cases: Today expansion
    const todayH = Math.max(...todayKlines.map(k => k.high));
    const todayL = Math.min(...todayKlines.map(k => k.low));
    const todayR = todayH - todayL;
    if (todayR > 1.2 * metrics.pdr) {
        reversal -= 20;
        continuation += 10;
    }

    // Normalize
    const total = reversal + continuation + range || 1;
    return {
        reversal: Math.round((reversal / total) * 100),
        continuation: Math.round((continuation / total) * 100),
        range: Math.round((range / total) * 100)
    };
}
