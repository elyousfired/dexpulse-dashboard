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
): Promise<{ current: AnchoredVwapResult; previous: AnchoredVwapResult; signal: 'LONG' | 'EXIT' | 'IDLE' } | null> {
    try {
        // Fetch 1m klines to have sub-resolution data for accurate anchoring
        // We need enough data to cover 2 candles of the specified timeframe.
        // For 15m, we need 30 minutes of data. Let's fetch 60 to be safe.
        const limit = timeframeMinutes * 3;
        const klines1m = await fetchBinanceKlines(symbol, '1m', limit);

        if (klines1m.length < timeframeMinutes * 2) return null;

        const now = Math.floor(Date.now() / 1000);
        const candleDurationSec = timeframeMinutes * 60;

        // Find the boundary between current and previous candle
        const currentCandleOpen = Math.floor(now / candleDurationSec) * candleDurationSec;
        const previousCandleOpen = currentCandleOpen - candleDurationSec;

        const currentKlines = klines1m.filter(k => k.time >= currentCandleOpen);
        // Long Anchor: from previous candle open until NOW
        const longAnchorKlines = klines1m.filter(k => k.time >= previousCandleOpen);

        const currentResult = calculateAVWAP(currentKlines);
        const previousResult = calculateAVWAP(longAnchorKlines);

        let signal: 'LONG' | 'EXIT' | 'IDLE' = 'IDLE';
        if (currentResult.vwap > previousResult.vwap && previousResult.vwap > 0) {
            signal = 'LONG';
        } else if (currentResult.vwap < previousResult.vwap && previousResult.vwap > 0) {
            signal = 'EXIT';
        }

        return {
            current: currentResult,
            previous: previousResult,
            signal
        };
    } catch (err) {
        console.error('Error in getSlidingAVWAPData:', err);
        return null;
    }
}
