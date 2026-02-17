import { fetchBinanceKlines, OHLCV } from './cexService';

export interface AnchoredVwapResult {
    vwap: number;
    cumulativeSumPV: number;
    cumulativeSumV: number;
    lastTypicalPrice: number;
    lastVolume: number;
    lastClosePrice: number;
    candleOpenTime: number;
    candleCloseTime: number;
}

/**
 * Calculates Anchored VWAP for a specific range of klines.
 * Anchors at the first kline in the list.
 */
export function calculateAVWAP(klines: OHLCV[]): AnchoredVwapResult {
    if (klines.length === 0) {
        return {
            vwap: 0,
            cumulativeSumPV: 0,
            cumulativeSumV: 0,
            lastTypicalPrice: 0,
            lastVolume: 0,
            lastClosePrice: 0,
            candleOpenTime: 0,
            candleCloseTime: 0
        };
    }

    let sumPV = 0;
    let sumV = 0;

    klines.forEach(k => {
        const typicalPrice = (k.high + k.low + k.close) / 3;
        const vol = k.quoteVolume || k.volume;
        sumPV += typicalPrice * vol;
        sumV += vol;
    });

    const lastK = klines[klines.length - 1];
    return {
        vwap: sumV > 0 ? sumPV / sumV : 0,
        cumulativeSumPV: sumPV,
        cumulativeSumV: sumV,
        lastTypicalPrice: (lastK.high + lastK.low + lastK.close) / 3,
        lastVolume: lastK.quoteVolume || lastK.volume,
        lastClosePrice: lastK.close,
        candleOpenTime: klines[0].time,
        candleCloseTime: lastK.time
    };
}

/**
 * Gets the sliding 2-candle AVWAP data for a symbol.
 * Timeframe is in minutes (default 15).
 */
export async function getSlidingAVWAPData(
    symbol: string,
    timeframeMinutes: number = 15
): Promise<{
    current: AnchoredVwapResult;
    previous: AnchoredVwapResult;
    fullRange: AnchoredVwapResult;
    signal: 'LONG' | 'EXIT' | 'IDLE'
} | null> {
    try {
        const limit = timeframeMinutes * 3;
        const klines1m = await fetchBinanceKlines(symbol, '1m', limit);

        if (klines1m.length === 0) return null;

        // Use the latest kline timestamp as the reference "now" to ensure perfect alignment with market data
        const latestTime = klines1m[klines1m.length - 1].time;
        const candleDurationSec = timeframeMinutes * 60;

        const currentCandleOpen = Math.floor(latestTime / candleDurationSec) * candleDurationSec;
        const previousCandleOpen = currentCandleOpen - candleDurationSec;

        const currentKlines = klines1m.filter(k => k.time >= currentCandleOpen);
        const longAnchorKlines = klines1m.filter(k => k.time >= previousCandleOpen);
        const previousDiscreteKlines = klines1m.filter(k => k.time >= previousCandleOpen && k.time < currentCandleOpen);

        const currentResult = calculateAVWAP(currentKlines);
        const fullRangeResult = calculateAVWAP(longAnchorKlines);
        const previousDiscreteResult = calculateAVWAP(previousDiscreteKlines);

        let signal: 'LONG' | 'EXIT' | 'IDLE' = 'IDLE';
        // Compare Current (Short Anchor) vs Full Range (Long Anchor)
        if (currentResult.vwap > fullRangeResult.vwap && fullRangeResult.vwap > 0) {
            signal = 'LONG';
        } else if (currentResult.vwap < fullRangeResult.vwap && fullRangeResult.vwap > 0) {
            signal = 'EXIT';
        }

        return {
            current: currentResult,
            previous: previousDiscreteResult,
            fullRange: fullRangeResult,
            signal
        };
    } catch (err) {
        console.error('Error in getSlidingAVWAPData:', err);
        return null;
    }
}
