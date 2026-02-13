import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { fetchGeckoOHLCV } from '../services/geckoService';
import { fetchBinanceKlines, subscribeToKlines } from '../services/cexService';
import { RefreshCcw, AlertCircle } from 'lucide-react';

interface TokenChartProps {
    address: string;
    pairAddress?: string;
    chainId?: string;
    symbol: string;
    isCex?: boolean;
}

const INTERVALS = [
    { label: '1m', value: '1m', days: 1 },
    { label: '5m', value: '5m', days: 1 },
    { label: '15m', value: '15m', days: 1 },
    { label: '1H', value: '1h', days: 7 },
    { label: '4H', value: '4h', days: 30 },
    { label: '1D', value: '1d', days: 90 },
];

export const TokenChart: React.FC<TokenChartProps> = ({ address, pairAddress, chainId, symbol, isCex }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const volumeCurveSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    const [interval, setInterval] = useState('15m');
    const [showVwap, setShowVwap] = useState(true);
    const [showVolumeCurve, setShowVolumeCurve] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#11141b' },
                textColor: '#9ca3af',
            },
            grid: {
                vertLines: { color: '#1f2937' },
                horzLines: { color: '#1f2937' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            timeScale: {
                timeVisible: true,
                borderColor: '#374151',
            },
            rightPriceScale: {
                borderColor: '#374151',
            },
            crosshair: {
                mode: 1, // CrosshairMode.Normal
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        const volumeSeries = chart.addHistogramSeries({
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // Overlay on same scale
        });

        const vwapSeries = chart.addLineSeries({
            color: '#3b82f6', // blue-500
            lineWidth: 2,
            priceLineVisible: false,
            title: 'VWAP',
        });

        const volumeCurveSeries = chart.addLineSeries({
            color: '#f59e0b', // amber-500
            lineWidth: 1.5,
            priceLineVisible: false,
            priceScaleId: '', // Overlay on volume
            title: 'Vol Curve',
        });

        // Scale volume and volume curve to bottom
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeCurveSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        volumeSeriesRef.current = volumeSeries;
        vwapSeriesRef.current = vwapSeries;
        volumeCurveSeriesRef.current = volumeCurveSeries;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (!address) return;

            setLoading(true);
            setError(null);

            try {
                // Map interval to Gecko format
                // 1m, 5m, 15m -> timeframe='minute', aggregate=1/5/15
                // 1H, 4H -> timeframe='hour', aggregate=1/4
                // 1D -> timeframe='day', aggregate=1
                let timeframe: 'day' | 'hour' | 'minute' = 'minute';
                let aggregate = 15;

                switch (interval) {
                    case '1m': timeframe = 'minute'; aggregate = 1; break;
                    case '5m': timeframe = 'minute'; aggregate = 5; break;
                    case '15m': timeframe = 'minute'; aggregate = 15; break;
                    case '1h': timeframe = 'hour'; aggregate = 1; break;
                    case '4h': timeframe = 'hour'; aggregate = 4; break;
                    case '1d': timeframe = 'day'; aggregate = 1; break;
                }

                let data: any[] = [];

                if (isCex) {
                    data = await fetchBinanceKlines(symbol, interval);
                } else {
                    if (!pairAddress || !chainId) {
                        throw new Error("Pair address and chain ID required for DEX chart");
                    }
                    data = await fetchGeckoOHLCV(chainId, pairAddress, timeframe, aggregate);
                }

                if (candlestickSeriesRef.current && volumeSeriesRef.current) {
                    if (data.length === 0) {
                        setError("No data returned from API.");
                        candlestickSeriesRef.current.setData([]);
                        volumeSeriesRef.current.setData([]);
                    } else {
                        const candleData = data.map(d => ({
                            time: d.time,
                            open: d.open,
                            high: d.high,
                            low: d.low,
                            close: d.close
                        }));

                        const volumeData = data.map(d => ({
                            time: d.time,
                            value: d.volume,
                            color: d.close >= d.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                        }));

                        candlestickSeriesRef.current.setData(candleData as any);
                        volumeSeriesRef.current.setData(volumeData as any);

                        // Calculate VWAP
                        let cumulativeTPV = 0;
                        let cumulativeVolume = 0;
                        const vwapData = data.map(d => {
                            const typicalPrice = (d.high + d.low + d.close) / 3;
                            cumulativeTPV += typicalPrice * d.volume;
                            cumulativeVolume += d.volume;
                            return {
                                time: d.time,
                                value: cumulativeTPV / cumulativeVolume
                            };
                        });

                        // Calculate Volume Curve (Moving Average of Volume, period 20)
                        const volumeCurveData = data.map((d, i, arr) => {
                            const period = 20;
                            const slice = arr.slice(Math.max(0, i - period + 1), i + 1);
                            const avgVal = slice.reduce((sum, curr) => sum + curr.volume, 0) / slice.length;
                            return { time: d.time, value: avgVal };
                        });

                        if (vwapSeriesRef.current) {
                            vwapSeriesRef.current.setData(showVwap ? vwapData as any : []);
                        }
                        if (volumeCurveSeriesRef.current) {
                            volumeCurveSeriesRef.current.setData(showVolumeCurve ? volumeCurveData as any : []);
                        }

                        // Fit content
                        chartRef.current?.timeScale().fitContent();
                    }
                }
            } catch (err: any) {
                // Friendly error message handling
                const msg = err.message || "Failed to load chart data";
                setError(msg);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [address, pairAddress, chainId, interval, isCex, symbol, showVwap, showVolumeCurve]);

    // Live WebSocket Updates (Full Candlestick)
    useEffect(() => {
        if (!isCex || !address || loading || error) return;

        const cleanup = subscribeToKlines(address, interval, (kline) => {
            if (!chartRef.current || !candlestickSeriesRef.current) return;

            // Update Candlestick with full OHLC
            candlestickSeriesRef.current.update({
                time: kline.time as any,
                open: kline.open,
                high: kline.high,
                low: kline.low,
                close: kline.close
            });

            if (volumeSeriesRef.current) {
                volumeSeriesRef.current.update({
                    time: kline.time as any,
                    value: kline.volume
                });
            }

            // Note: Indicators like VWAP/Volume Curve could also be updated here 
            // but they rely on cumulative data from the historical fetch.
            // For now, updating the candle itself solves the user's primary complaint.
        });

        return () => cleanup();
    }, [isCex, address, interval, loading, error]);

    return (
        <div className="flex flex-col h-full bg-[#11141b] rounded-xl overflow-hidden border border-gray-800">
            <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-[#1a1e26]/50">
                <div className="flex items-center gap-2">
                    <h3 className="text-white font-bold text-sm tracking-tight">{symbol} / USD</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 border border-gray-700 font-mono">
                        {interval.toUpperCase()}
                    </span>
                </div>
                <div className="flex bg-[#11141b] rounded-lg p-0.5 border border-gray-700">
                    {INTERVALS.map((int) => (
                        <button
                            key={int.value}
                            onClick={() => setInterval(int.value)}
                            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-all ${interval === int.value
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            {int.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Indicators Toggles */}
            <div className="flex items-center gap-4 px-3 py-2 border-b border-gray-800 bg-[#1a1e26]/30">
                <button
                    onClick={() => setShowVwap(!showVwap)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all ${showVwap ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-gray-500 border border-transparent'
                        }`}
                >
                    <div className={`w-2 h-2 rounded-full ${showVwap ? 'bg-blue-500' : 'bg-gray-600'}`} />
                    VWAP
                </button>
                <button
                    onClick={() => setShowVolumeCurve(!showVolumeCurve)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all ${showVolumeCurve ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-gray-500 border border-transparent'
                        }`}
                >
                    <div className={`w-2 h-2 rounded-full ${showVolumeCurve ? 'bg-amber-500' : 'bg-gray-600'}`} />
                    VOL CURVE
                </button>
            </div>

            <div className="relative flex-1 min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#11141b]/80 backdrop-blur-sm">
                        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#11141b]/90 backdrop-blur-sm p-6 text-center">
                        <AlertCircle className="w-10 h-10 text-yellow-500 mb-3" />
                        <h4 className="text-white font-bold mb-1">Chart Unavailable</h4>
                        <p className="text-gray-400 text-sm max-w-[250px]">{error}</p>
                    </div>
                )}

                <div ref={chartContainerRef} className="w-full h-full" />
            </div>
        </div>
    );
};
