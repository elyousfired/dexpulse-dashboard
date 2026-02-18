
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

export interface TmaState {
    metrics: TmaMetrics;
    classification: DayClassification;
    zones: LiquidityZones;
    liquidityTaken: {
        buySide: boolean;
        sellSide: boolean;
    };
    current: {
        state: 'INSIDE RANGE' | 'SWEEPING LIQUIDITY' | 'ACCEPT ABOVE' | 'ACCEPT BELOW' | 'REBALANCING' | 'EXPANSION';
        last15mSweep?: 'Buy-Side' | 'Sell-Side';
        acceptance?: 'Above PDH' | 'Below PDL';
        mss?: 'Long' | 'Short';
        bias: 'Bullish' | 'Bearish' | 'Neutral' | 'Reversal Long' | 'Reversal Short';
        confidence: number;
        distances: {
            pdh: number;
            pdl: number;
            mid: number;
        };
    };
    probabilities: {
        reversal: number;
        continuation: number;
        range: number;
    };
}

export function calculateATR(klines: OHLCV[], period: number = 14): number {
    if (klines.length < period) return 0;
    const trs: number[] = [];
    for (let i = 1; i < klines.length; i++) {
        const h = klines[i].high;
        const l = klines[i].low;
        const pc = klines[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const sum = trs.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
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

export interface LiquidityZones {
    buySide: [number, number];
    sellSide: [number, number];
    rebalance: [number, number];
}

export function calculateLiquidityZones(metrics: TmaMetrics, currentPrice: number, atr: number): LiquidityZones {
    const { pdh, pdl, mid, pdr } = metrics;
    // Zone size: max(0.2% of current price, 0.15 * ATR)
    const zone_size = Math.max(currentPrice * 0.002, 0.15 * atr || pdr * 0.1);

    return {
        buySide: [pdh, pdh + zone_size],
        sellSide: [pdl - zone_size, pdl],
        rebalance: [mid - (0.1 * pdr), mid + (0.1 * pdr)]
    };
}

export function analyzeIntraday(metrics: TmaMetrics, today15m: OHLCV[]): TmaState['current'] & { liquidityTaken: TmaState['liquidityTaken'] } {
    const { pdh, pdl, mid } = metrics;
    const last = today15m[today15m.length - 1];

    // Default State
    let state: TmaState['current']['state'] = 'INSIDE RANGE';
    let sweep: 'Buy-Side' | 'Sell-Side' | undefined;
    let acceptance: 'Above PDH' | 'Below PDL' | undefined;
    let mss: 'Long' | 'Short' | undefined;

    // Liquidity Tracking
    const buy_liquidity_taken = today15m.some(k => k.high > pdh);
    const sell_liquidity_taken = today15m.some(k => k.low < pdl);

    if (today15m.length === 0) {
        return {
            state: 'INSIDE RANGE',
            bias: 'Neutral',
            confidence: 0,
            distances: { pdh: 0, pdl: 0, mid: 0 },
            liquidityTaken: { buySide: false, sellSide: false }
        };
    }

    // A) Sweep Detection (recent N=8 candles)
    const recent = today15m.slice(-8);
    for (const k of recent) {
        if (k.high > pdh && k.close < pdh) sweep = 'Buy-Side';
        if (k.low < pdl && k.close > pdl) sweep = 'Sell-Side';
    }

    // B) Acceptance Detection (two consecutive closes)
    for (let i = 1; i < today15m.length; i++) {
        if (today15m[i - 1].close > pdh && today15m[i].close > pdh) acceptance = 'Above PDH';
        if (today15m[i - 1].close < pdl && today15m[i].close < pdl) acceptance = 'Below PDL';
    }

    // C) Market Structure Shift (MSS) after Sweep
    if (sweep === 'Sell-Side') {
        // Last peak before sweep
        const sweepIndex = today15m.findIndex(k => k.low < pdl && k.close > pdl);
        if (sweepIndex !== -1) {
            const beforeSweep = today15m.slice(Math.max(0, sweepIndex - 10), sweepIndex);
            const swingHigh = beforeSweep.length > 0 ? Math.max(...beforeSweep.map(k => k.high)) : 0;
            if (last.close > swingHigh && swingHigh > 0) mss = 'Long';
        }
    }
    if (sweep === 'Buy-Side') {
        const sweepIndex = today15m.findIndex(k => k.high > pdh && k.close < pdh);
        if (sweepIndex !== -1) {
            const beforeSweep = today15m.slice(Math.max(0, sweepIndex - 10), sweepIndex);
            const swingLow = beforeSweep.length > 0 ? Math.min(...beforeSweep.map(k => k.low)) : 99999999;
            if (last.close < swingLow && swingLow < 99999999) mss = 'Short';
        }
    }

    // Determine Final State
    if (acceptance === 'Above PDH') state = 'ACCEPT ABOVE';
    else if (acceptance === 'Below PDL') state = 'ACCEPT BELOW';
    else if (sweep) state = 'SWEEPING LIQUIDITY';
    else if (last.close > mid - (metrics.pdr * 0.05) && last.close < mid + (metrics.pdr * 0.05)) state = 'REBALANCING';
    else if (last.close > pdl && last.close < pdh) state = 'INSIDE RANGE';

    // Distances
    const price = last.close;
    const distances = {
        pdh: ((pdh - price) / price) * 100,
        pdl: ((price - pdl) / price) * 100,
        mid: Math.abs(price - mid) / price * 100
    };

    return {
        state,
        last15mSweep: sweep,
        acceptance,
        mss,
        bias: 'Neutral', // will be refined by scenarios
        confidence: 0,
        distances,
        liquidityTaken: { buySide: buy_liquidity_taken, sellSide: sell_liquidity_taken }
    };
}

export function runScenarioEngine(
    metrics: TmaMetrics,
    current: ReturnType<typeof analyzeIntraday>,
    todayKlines: OHLCV[]
): TmaState['probabilities'] {
    let rev = 5;
    let cont = 5;
    let range = 10;

    const last = todayKlines[todayKlines.length - 1];
    if (!last) return { reversal: 33, continuation: 33, range: 34 };

    // 1. Sweep Detected
    if (current.last15mSweep) rev += 40;

    // 2. MSS confirmed
    if (current.mss) rev += 25;

    // 3. Acceptance
    if (current.acceptance) cont += 45;

    // 4. Position
    if (last.close > metrics.pdl && last.close < metrics.pdh) range += 25;

    // 5. Volume
    const recentKlines = todayKlines.slice(-50);
    const avgVol = recentKlines.reduce((s, k) => s + k.volume, 0) / recentKlines.length;
    if (last.volume > avgVol * 1.5) {
        if (current.acceptance) cont += 15;
        if (current.last15mSweep) rev += 15;
    }

    // 6. Compression
    const todayH = Math.max(...todayKlines.map(k => k.high));
    const todayL = Math.min(...todayKlines.map(k => k.low));
    if ((todayH - todayL) < 0.6 * metrics.pdr) {
        range += 10;
        cont += 10;
    }

    const sum = rev + cont + range;
    return {
        reversal: Math.round((rev / sum) * 100),
        continuation: Math.round((cont / sum) * 100),
        range: Math.round((range / sum) * 100)
    };
}
