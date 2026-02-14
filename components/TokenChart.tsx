import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

import { fetchGeckoOHLCV } from '../services/geckoService';
import { fetchBinanceKlines, subscribeToKlines } from '../services/cexService';
import { executeIndicatorScript, OHLCV } from '../services/scriptEngine';
import { RefreshCcw, AlertCircle, BarChart2, TrendingUp } from 'lucide-react';

interface TokenChartProps {
    address: string;
    pairAddress?: string;
    chainId?: string;
    symbol: string;
    isCex?: boolean;
    customScript?: string | null;
    activeView?: 'price' | 'flow';
}

const INTERVALS = [
    { label: '1m', value: '1m', days: 1 },
    { label: '5m', value: '5m', days: 1 },
    { label: '15m', value: '15m', days: 1 },
    { label: '1H', value: '1h', days: 7 },
    { label: '4H', value: '4h', days: 30 },
    { label: '1D', value: '1d', days: 90 },
];

export const TokenChart: React.FC<TokenChartProps> = ({
    address, pairAddress, chainId, symbol, isCex, customScript, activeView = 'price'
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const volumeCurveSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const customSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const netFlowSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

    const [interval, setInterval] = useState('15m');
    const [showVwap, setShowVwap] = useState(true);
    const [showVolumeCurve, setShowVolumeCurve] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [processedData, setProcessedData] = useState<any[]>([]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#11141b' },
                textColor: '#9ca3af',
                fontFamily: 'Inter, system-ui, sans-serif',
            },
            grid: {
                vertLines: { color: 'rgba(31, 41, 55, 0.5)' },
                horzLines: { color: 'rgba(31, 41, 55, 0.5)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 480,
            timeScale: {
                timeVisible: true,
                borderColor: '#1f2937',
                rightOffset: 12,
            },
            rightPriceScale: {
                borderColor: '#1f2937',
            },
            crosshair: {
                mode: 1,
            },
        });

        candlestickSeriesRef.current = chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        volumeSeriesRef.current = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });

        vwapSeriesRef.current = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            priceLineVisible: false,
            title: 'VWAP',
        });

        volumeCurveSeriesRef.current = chart.addLineSeries({
            color: '#f59e0b',
            lineWidth: 1,
            priceLineVisible: false,
            priceScaleId: '',
            title: 'Vol Curve',
        });

        // Specialized Custom/Flow Series
        customSeriesRef.current = chart.addLineSeries({
            color: '#a855f7', // purple-500
            lineWidth: 2,
            priceLineVisible: false,
            title: 'Indicator',
        });

        netFlowSeriesRef.current = chart.addHistogramSeries({
            color: '#22c55e',
            priceFormat: { type: 'volume' },
            title: 'Net Flow',
        });

        volumeSeriesRef.current.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeCurveSeriesRef.current.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        chartRef.current = chart;

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

    // Handle View Mode Switching (Price vs Flow)
    useEffect(() => {
        if (!candlestickSeriesRef.current || !volumeSeriesRef.current || !vwapSeriesRef.current || !volumeCurveSeriesRef.current || !netFlowSeriesRef.current) return;

        const isPrice = activeView === 'price';
        const isFlow = activeView === 'flow';

        // Toggle visibility by resetting data or using options if available
        // In Lightweight charts, simple way is to manage data injection
    }, [activeView]);

    useEffect(() => {
        const fetchData = async () => {
            if (!address) return;
            setLoading(true);
            setError(null);

            try {
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

                let data: OHLCV[] = [];
                if (isCex) {
                    data = await fetchBinanceKlines(symbol, interval);
                } else {
                    if (!pairAddress || !chainId) throw new Error("Pair details missing");
                    data = await fetchGeckoOHLCV(chainId, pairAddress, timeframe, aggregate);
                }

                setProcessedData(data);

                if (chartRef.current && candlestickSeriesRef.current && volumeSeriesRef.current) {
                    const isFlowMode = activeView === 'flow';

                    // 1. Candlesticks (Visible only in Price mode)
                    candlestickSeriesRef.current.setData(isFlowMode ? [] : data.map(d => ({
                        time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close
                    })));

                    // 2. Volume (Visible only in Price mode)
                    volumeSeriesRef.current.setData(isFlowMode ? [] : data.map(d => ({
                        time: d.time as any,
                        value: d.volume,
                        color: d.close >= d.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                    })));

                    // 3. VWAP & curve
                    if (vwapSeriesRef.current && volumeCurveSeriesRef.current) {
                        if (!isFlowMode && showVwap) {
                            let cvtpv = 0, cv = 0;
                            vwapSeriesRef.current.setData(data.map(d => {
                                const tp = (d.high + d.low + d.close) / 3;
                                cvtpv += tp * d.volume; cv += d.volume;
                                return { time: d.time as any, value: cvtpv / cv };
                            }));
                        } else vwapSeriesRef.current.setData([]);

                        if (!isFlowMode && showVolumeCurve) {
                            volumeCurveSeriesRef.current.setData(data.map((d, i, arr) => {
                                const slice = arr.slice(Math.max(0, i - 19), i + 1);
                                const avg = slice.reduce((s, c) => s + c.volume, 0) / slice.length;
                                return { time: d.time as any, value: avg };
                            }));
                        } else volumeCurveSeriesRef.current.setData([]);
                    }

                    // 4. Custom Indicator (Enabled when script exists)
                    if (customSeriesRef.current) {
                        if (customScript) {
                            try {
                                const res = executeIndicatorScript(customScript, data);
                                customSeriesRef.current.setData(res as any);
                            } catch (e) { console.error("Script error:", e); }
                        } else customSeriesRef.current.setData([]);
                    }

                    // 5. Net Flow (Visible only in Flow mode)
                    if (netFlowSeriesRef.current) {
                        if (isFlowMode) {
                            netFlowSeriesRef.current.setData(data.map(d => {
                                const buy = d.buyVolume || 0;
                                const sell = d.volume - buy;
                                const net = buy - sell;
                                return {
                                    time: d.time as any,
                                    value: net,
                                    color: net >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'
                                };
                            }));
                        } else netFlowSeriesRef.current.setData([]);
                    }

                    chartRef.current.timeScale().fitContent();
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [address, interval, isCex, symbol, showVwap, showVolumeCurve, customScript, activeView]);

    useEffect(() => {
        if (!isCex || !address || loading) return;
        const cleanup = subscribeToKlines(address, interval, (kline) => {
            if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
            const isFlowMode = activeView === 'flow';

            if (!isFlowMode) {
                candlestickSeriesRef.current.update({
                    time: kline.time as any, open: kline.open, high: kline.high, low: kline.low, close: kline.close
                });
                volumeSeriesRef.current.update({
                    time: kline.time as any,
                    value: kline.volume,
                    color: kline.close >= kline.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                });
            }

            if (netFlowSeriesRef.current && isFlowMode) {
                const buy = kline.buyVolume || 0;
                const sell = kline.volume - buy;
                const net = buy - sell;
                netFlowSeriesRef.current.update({
                    time: kline.time as any,
                    value: net,
                    color: net >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'
                });
            }
        });
        return () => cleanup();
    }, [isCex, address, interval, loading, activeView]);

    return (
        <div className="flex flex-col h-full bg-[#11141b] rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-[#1a1e26]/50">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-white font-bold text-sm tracking-tight">{symbol}</h3>
                        <div className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-mono border border-blue-500/20">
                            {interval}
                        </div>
                    </div>
                </div>
                <div className="flex bg-[#0d0f14] rounded-lg p-0.5 border border-gray-700">
                    {INTERVALS.map((int) => (
                        <button
                            key={int.value}
                            onClick={() => setInterval(int.value)}
                            className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${interval === int.value
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-500 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            {int.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={`relative flex-1 ${activeView === 'flow' ? 'bg-[#0d0f14]' : ''}`}>
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#11141b]/80 backdrop-blur-sm">
                        <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                )}
                <div ref={chartContainerRef} className="w-full h-full" />
            </div>

            {/* View Stats Overlay */}
            <div className="flex items-center gap-6 px-4 py-2 border-t border-gray-800 bg-[#1a1e26]/30">
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowVwap(!showVwap)} className={`flex items-center gap-1 text-[10px] font-bold ${showVwap ? 'text-blue-400' : 'text-gray-600'}`}>
                        <div className={`w-2 h-2 rounded-full ${showVwap ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-gray-700'}`} />
                        VWAP
                    </button>
                    <button onClick={() => setShowVolumeCurve(!showVolumeCurve)} className={`flex items-center gap-1 text-[10px] font-bold ${showVolumeCurve ? 'text-amber-500' : 'text-gray-600'}`}>
                        <div className={`w-2 h-2 rounded-full ${showVolumeCurve ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-gray-700'}`} />
                        VOLUME AVG
                    </button>
                </div>
                {customScript && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-purple-400">
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                        CUSTOM INDICATOR ACTIVE
                    </div>
                )}
            </div>
        </div>
    );
};
