
import { OHLCV } from '../types';
import { VwapData } from '../types';

// ─── VWAP Architecture Types ──────────────────────

export interface VwapArchMetrics {
    wMax: number;      // Highest daily VWAP since Monday
    wMin: number;      // Lowest daily VWAP since Monday
    wMid: number;      // Current day's live VWAP
    wRange: number;    // wMax - wMin
    slope: number;     // Raw slope
    normalizedSlope: number; // ATR-normalized slope
}

export type VwapTrend = 'Bullish' | 'Bearish' | 'Neutral';

export interface VwapArchState {
    metrics: VwapArchMetrics;
    trend: VwapTrend;
    current: {
        state: 'INSIDE VWAP RANGE' | 'SWEEPING W-MAX' | 'SWEEPING W-MIN' | 'ACCEPT ABOVE' | 'ACCEPT BELOW' | 'REBALANCING';
        lastSweep?: 'W-Max' | 'W-Min';
        acceptance?: 'Above W-Max' | 'Below W-Min';
        mss?: 'Long' | 'Short';
        bias: 'Bullish' | 'Bearish' | 'Neutral' | 'Reversal Long' | 'Reversal Short';
        confidence: number;
        distances: {
            wMax: number;
            wMin: number;
            wMid: number;
        };
    };
    liquidityTaken: {
        buySide: boolean;  // Price swept above W-Max
        sellSide: boolean; // Price swept below W-Min
    };
    probabilities: {
        reversal: number;
        continuation: number;
        range: number;
    };
}

// ─── Build Metrics from VwapData ──────────────────

export function buildVwapMetrics(vwap: VwapData): VwapArchMetrics {
    return {
        wMax: vwap.max,
        wMin: vwap.min,
        wMid: vwap.mid,
        wRange: vwap.max - vwap.min,
        slope: vwap.slope,
        normalizedSlope: vwap.normalizedSlope,
    };
}

export function classifyVwapTrend(metrics: VwapArchMetrics): VwapTrend {
    if (metrics.normalizedSlope > 0.15) return 'Bullish';
    if (metrics.normalizedSlope < -0.15) return 'Bearish';
    return 'Neutral';
}

// ─── Intraday Analysis against VWAP Levels ────────

export function analyzeVwapIntraday(
    metrics: VwapArchMetrics,
    intradayKlines: OHLCV[]
): VwapArchState['current'] & { liquidityTaken: VwapArchState['liquidityTaken'] } {
    const { wMax, wMin, wMid, wRange } = metrics;

    if (intradayKlines.length === 0) {
        return {
            state: 'INSIDE VWAP RANGE',
            bias: 'Neutral',
            confidence: 0,
            distances: { wMax: 0, wMin: 0, wMid: 0 },
            liquidityTaken: { buySide: false, sellSide: false }
        };
    }

    const last = intradayKlines[intradayKlines.length - 1];
    let state: VwapArchState['current']['state'] = 'INSIDE VWAP RANGE';
    let sweep: 'W-Max' | 'W-Min' | undefined;
    let acceptance: 'Above W-Max' | 'Below W-Min' | undefined;
    let mss: 'Long' | 'Short' | undefined;

    // Track if W-Max or W-Min were touched today
    const buySideTaken = intradayKlines.some(k => k.high > wMax);
    const sellSideTaken = intradayKlines.some(k => k.low < wMin);

    // A) Sweep Detection (last 8 candles)
    const recent = intradayKlines.slice(-8);
    for (const k of recent) {
        // Wick above W-Max but closed below = sweep
        if (k.high > wMax && k.close < wMax) sweep = 'W-Max';
        // Wick below W-Min but closed above = sweep
        if (k.low < wMin && k.close > wMin) sweep = 'W-Min';
    }

    // B) Acceptance Detection (two consecutive closes beyond level)
    for (let i = 1; i < intradayKlines.length; i++) {
        if (intradayKlines[i - 1].close > wMax && intradayKlines[i].close > wMax) {
            acceptance = 'Above W-Max';
        }
        if (intradayKlines[i - 1].close < wMin && intradayKlines[i].close < wMin) {
            acceptance = 'Below W-Min';
        }
    }

    // C) Market Structure Shift (MSS) after Sweep
    if (sweep === 'W-Min') {
        const sweepIndex = intradayKlines.findIndex(k => k.low < wMin && k.close > wMin);
        if (sweepIndex !== -1) {
            const beforeSweep = intradayKlines.slice(Math.max(0, sweepIndex - 10), sweepIndex);
            const swingHigh = beforeSweep.length > 0 ? Math.max(...beforeSweep.map(k => k.high)) : 0;
            if (last.close > swingHigh && swingHigh > 0) mss = 'Long';
        }
    }
    if (sweep === 'W-Max') {
        const sweepIndex = intradayKlines.findIndex(k => k.high > wMax && k.close < wMax);
        if (sweepIndex !== -1) {
            const beforeSweep = intradayKlines.slice(Math.max(0, sweepIndex - 10), sweepIndex);
            const swingLow = beforeSweep.length > 0 ? Math.min(...beforeSweep.map(k => k.low)) : Infinity;
            if (last.close < swingLow && swingLow < Infinity) mss = 'Short';
        }
    }

    // Determine Final State
    if (acceptance === 'Above W-Max') state = 'ACCEPT ABOVE';
    else if (acceptance === 'Below W-Min') state = 'ACCEPT BELOW';
    else if (sweep) state = sweep === 'W-Max' ? 'SWEEPING W-MAX' : 'SWEEPING W-MIN';
    else if (last.close > wMid - (wRange * 0.05) && last.close < wMid + (wRange * 0.05)) state = 'REBALANCING';
    else if (last.close > wMin && last.close < wMax) state = 'INSIDE VWAP RANGE';

    // Distances
    const price = last.close;
    const distances = {
        wMax: ((wMax - price) / price) * 100,
        wMin: ((price - wMin) / price) * 100,
        wMid: Math.abs(price - wMid) / price * 100
    };

    return {
        state,
        lastSweep: sweep,
        acceptance,
        mss,
        bias: 'Neutral',
        confidence: 0,
        distances,
        liquidityTaken: { buySide: buySideTaken, sellSide: sellSideTaken }
    };
}

// ─── VWAP Scenario Probability Engine ─────────────

export function runVwapScenarioEngine(
    metrics: VwapArchMetrics,
    current: ReturnType<typeof analyzeVwapIntraday>,
    klines: OHLCV[]
): VwapArchState['probabilities'] {
    let rev = 5;
    let cont = 5;
    let range = 10;

    const last = klines[klines.length - 1];
    if (!last) return { reversal: 33, continuation: 33, range: 34 };

    // 1. Sweep detected → reversal signal
    if (current.lastSweep) rev += 40;

    // 2. MSS confirmed → strong reversal
    if (current.mss) rev += 25;

    // 3. Acceptance → continuation signal
    if (current.acceptance) cont += 45;

    // 4. Price inside range → range signal
    if (last.close > metrics.wMin && last.close < metrics.wMax) range += 25;

    // 5. Slope alignment
    if (metrics.normalizedSlope > 0.2 && current.acceptance === 'Above W-Max') cont += 15;
    if (metrics.normalizedSlope < -0.2 && current.acceptance === 'Below W-Min') cont += 15;

    // 6. Volume surge
    const recentKlines = klines.slice(-50);
    const avgVol = recentKlines.reduce((s, k) => s + k.volume, 0) / recentKlines.length;
    if (last.volume > avgVol * 1.5) {
        if (current.acceptance) cont += 10;
        if (current.lastSweep) rev += 10;
    }

    // 7. Compression (tight range today vs weekly range)
    const todayH = Math.max(...klines.slice(-20).map(k => k.high));
    const todayL = Math.min(...klines.slice(-20).map(k => k.low));
    if ((todayH - todayL) < 0.5 * metrics.wRange) {
        range += 10;
    }

    const sum = rev + cont + range;
    return {
        reversal: Math.round((rev / sum) * 100),
        continuation: Math.round((cont / sum) * 100),
        range: Math.round((range / sum) * 100)
    };
}
