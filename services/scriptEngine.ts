
/**
 * Script Execution Engine for Custom Indicators
 * This service takes OHLCV data and a user-defined JS string,
 * executes it in a sandboxed-ish environment, and returns chart data.
 */

export interface OHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    buyVolume?: number;  // Taker Buy Volume
    sellVolume?: number; // Total Volume - Taker Buy Volume
}

export interface IndicatorResult {
    time: number;
    value: number;
    color?: string;
}

export function executeIndicatorScript(
    script: string,
    data: OHLCV[]
): IndicatorResult[] {
    try {
        // Create a function from the user script
        // We provide 'data' and specific shortcut arrays for convenience
        const engine = new Function('data', 'open', 'high', 'low', 'close', 'volume', 'buyVolume', 'sellVolume', 'netFlow', script);

        // Execute script
        // Expected script format: "return data.map(...)" or raw logic
        const result = engine(
            data,
            data.map(d => d.open),
            data.map(d => d.high),
            data.map(d => d.low),
            data.map(d => d.close),
            data.map(d => d.volume),
            data.map(d => d.buyVolume || 0),
            data.map(d => (d.volume - (d.buyVolume || 0))),
            data.map(d => (d.buyVolume || 0) - (d.volume - (d.buyVolume || 0))) // netFlow
        );

        if (!Array.isArray(result)) {
            throw new Error("Script must return an array of values");
        }

        // Map results back to chart format
        return result.map((val, i) => ({
            time: data[i].time,
            value: typeof val === 'object' ? val.value : val,
            color: typeof val === 'object' ? val.color : undefined
        }));
    } catch (err: any) {
        console.error("[ScriptEngine] Execution Error:", err.message);
        throw err;
    }
}
