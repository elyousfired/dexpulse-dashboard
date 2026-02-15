
import { OHLCV } from './cexService';

/**
 * Port of Pine Script's SAC Rotation Engine logic.
 * Formula: SAC = (PriceNorm / EMA(PriceNorm)) - EMA(PriceNorm / EMA(PriceNorm))
 */

export interface SACResult {
    symbol: string;
    sac: number;
    score: number;
    price: number;
    priceNorm: number;
}

export interface RotationSignal {
    exit: string;
    enter: string;
    spread: number;
    shouldRotate: boolean;
    results: SACResult[];
}

/**
 * Calculates EMA for a series
 */
function calculateEMA(data: number[], length: number): number[] {
    const ema: number[] = [];
    const alpha = 2 / (length + 1);

    let prevEma = data[0];
    ema[0] = prevEma;

    for (let i = 1; i < data.length; i++) {
        const currentEma = (data[i] - prevEma) * alpha + prevEma;
        ema[i] = currentEma;
        prevEma = currentEma;
    }
    return ema;
}

/**
 * Normalizes a value between 0 and 1 over a lookback window
 */
function normalize(series: number[], length: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < series.length; i++) {
        if (i < length - 1) {
            result.push(0.5);
            continue;
        }
        const window = series.slice(i - length + 1, i + 1);
        const min = Math.min(...window);
        const max = Math.max(...window);
        if (max === min) {
            result.push(0.5);
        } else {
            result.push((series[i] - min) / (max - min));
        }
    }
    return result;
}

export async function computeSACRotation(
    candidates: { symbol: string; klines: OHLCV[] }[],
    config = { lenNorm: 50, lenEma: 21, lenVol: 50, threshold: 0.25 }
): Promise<RotationSignal> {
    const results: SACResult[] = [];

    for (const cand of candidates) {
        const prices = cand.klines.map(k => k.close);
        const volumes = cand.klines.map(k => k.volume);

        // 1. Normalization
        const priceNorm = normalize(prices, config.lenNorm);
        const volNorm = normalize(volumes, config.lenVol);

        // 2. Strength = price_norm / ema(price_norm, len_ema)
        const emaPriceNorm = calculateEMA(priceNorm, config.lenEma);
        const strengths = priceNorm.map((p, i) => emaPriceNorm[i] !== 0 ? p / emaPriceNorm[i] : 1);

        // 3. SAC = strength - ema(strength, len_ema)
        const emaStrength = calculateEMA(strengths, config.lenEma);
        const sacSeries = strengths.map((s, i) => s - emaStrength[i]);

        // 4. Volume Factor
        const currentVolNorm = volNorm[volNorm.length - 1];
        const volFactor = currentVolNorm < 0.3 ? 1.0 : 0.5;

        const currentSac = sacSeries[sacSeries.length - 1];
        const score = currentSac * volFactor;

        results.push({
            symbol: cand.symbol,
            sac: currentSac,
            score: score,
            price: prices[prices.length - 1],
            priceNorm: priceNorm[priceNorm.length - 1]
        });
    }

    // Sort by score
    const sorted = [...results].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const spread = best.score - worst.score;

    return {
        enter: best.symbol,
        exit: worst.symbol,
        spread: spread,
        shouldRotate: spread > config.threshold,
        results: results
    };
}
