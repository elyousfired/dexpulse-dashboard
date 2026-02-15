import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle } from 'lightweight-charts';

import { fetchBinanceKlines, subscribeToKlines, fetchWeeklyVwapData, VwapData } from '../services/cexService';
import { executeIndicatorScript, OHLCV } from '../services/scriptEngine';
import { RefreshCcw, Activity, BarChart2, Zap, TrendingUp, Layers, Eye, EyeOff } from 'lucide-react';

interface TokenChartProps {
    address: string;
    symbol: string;
    isCex?: boolean;
    customScript?: string | null;
    activeView?: 'price' | 'flow' | 'vwap_weekly';
    onDivergenceDetected?: (type: 'absorption' | 'trend' | 'none') => void;
}

const INTERVALS = [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
];

export const TokenChart: React.FC<TokenChartProps> = ({
    address, symbol, isCex = true, customScript, activeView = 'price', onDivergenceDetected
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const volumeCurveSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const weeklyMaxSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const weeklyMinSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const customSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const netFlowSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const cvdSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const flowZoneSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

    const [interval, setInterval] = useState('15m');
    const [showVwap, setShowVwap] = useState(true);
    const [showVolume, setShowVolume] = useState(false);
    const [showVolumeCurve, setShowVolumeCurve] = useState(false);
    const [showWeeklyVwap, setShowWeeklyVwap] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [vwapData, setVwapData] = useState<VwapData | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#0d0f14' },
                textColor: '#9ca3af',
                fontFamily: 'Inter, system-ui, sans-serif',
            },
            grid: {
                vertLines: { color: 'rgba(31, 41, 55, 0.3)' },
                horzLines: { color: 'rgba(31, 41, 55, 0.3)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 520,
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
            timeScale: {
                timeVisible: true,
                borderColor: '#1f2937',
                rightOffset: 20,
                barSpacing: 8,
                minBarSpacing: 1,
            },
            rightPriceScale: {
                borderColor: '#1f2937',
                autoScale: true,
                alignLabels: true,
            },
            crosshair: {
                mode: 1,
                vertLine: { labelBackgroundColor: '#3b82f6' },
                horzLine: { labelBackgroundColor: '#3b82f6' },
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

        // Weekly structural lines
        weeklyMaxSeriesRef.current = chart.addLineSeries({
            color: '#10b981', // emerald-500
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: true,
            title: 'WEEKLY MAX',
        });

        weeklyMinSeriesRef.current = chart.addLineSeries({
            color: '#f43f5e', // rose-500
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: true,
            title: 'WEEKLY MIN',
        });

        customSeriesRef.current = chart.addLineSeries({
            color: '#a855f7',
            lineWidth: 2,
            priceLineVisible: false,
            title: 'Indicator',
        });

        netFlowSeriesRef.current = chart.addHistogramSeries({
            color: '#22c55e',
            priceFormat: { type: 'volume' },
            title: 'Net Flow',
        });

        cvdSeriesRef.current = chart.addLineSeries({
            color: '#facc15',
            lineWidth: 2,
            title: 'CVD',
        });

        flowZoneSeriesRef.current = chart.addAreaSeries({
            topColor: 'rgba(34, 197, 94, 0.12)',
            bottomColor: 'rgba(239, 68, 68, 0.12)',
            lineVisible: false,
            priceScaleId: '',
            title: 'Flow Zones',
        });

        volumeSeriesRef.current.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });
        volumeCurveSeriesRef.current.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
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

    useEffect(() => {
        const fetchData = async () => {
            if (!address) return;
            setLoading(true);
            setError(null);

            try {
                // Fetch OHLCV + Weekly Data
                const [data, weekly] = await Promise.all([
                    fetchBinanceKlines(symbol, interval),
                    fetchWeeklyVwapData(symbol)
                ]);

                setVwapData(weekly);

                if (chartRef.current && candlestickSeriesRef.current) {
                    const isFlowMode = activeView === 'flow';
                    const isVwapWeeklyView = activeView === 'vwap_weekly';

                    // If in VWAP Weekly view, ensure indicators are on
                    if (isVwapWeeklyView) {
                        setShowWeeklyVwap(true);
                    }

                    // 1. Candlesticks with State Coloring
                    candlestickSeriesRef.current.setData(isFlowMode ? [] : data.map(d => {
                        let color = d.close >= d.open ? '#22c55e' : '#ef4444';

                        // Highlight Green State on Candles
                        if (weekly && d.close > weekly.max && d.close > weekly.mid) {
                            color = '#10b981'; // Vibrant emerald for breakout
                        }

                        return {
                            time: d.time as any,
                            open: d.open,
                            high: d.high,
                            low: d.low,
                            close: d.close,
                            color: color,
                            wickColor: color,
                        };
                    }));

                    // 2. Volume
                    if (volumeSeriesRef.current) {
                        volumeSeriesRef.current.setData(!isFlowMode && showVolume ? data.map(d => ({
                            time: d.time as any,
                            value: d.volume,
                            color: d.close >= d.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                        })) : []);
                    }

                    // 3. Indicators
                    if (vwapSeriesRef.current) {
                        if (!isFlowMode && showVwap) {
                            let cvtpv = 0, cv = 0;
                            vwapSeriesRef.current.setData(data.map(d => {
                                const tp = (d.high + d.low + d.close) / 3;
                                cvtpv += tp * d.volume; cv += d.volume;
                                return { time: d.time as any, value: cvtpv / cv };
                            }));
                        } else vwapSeriesRef.current.setData([]);
                    }

                    if (volumeCurveSeriesRef.current) {
                        if (!isFlowMode && showVolumeCurve) {
                            volumeCurveSeriesRef.current.setData(data.map((d, i, arr) => {
                                const slice = arr.slice(Math.max(0, i - 19), i + 1);
                                const avg = slice.reduce((s, c) => s + c.volume, 0) / slice.length;
                                return { time: d.time as any, value: avg };
                            }));
                        } else volumeCurveSeriesRef.current.setData([]);
                    }

                    // Structural Weekly Lines & Background Traffic Shading
                    if (weeklyMaxSeriesRef.current && weeklyMinSeriesRef.current && chartRef.current) {
                        const showWeekly = showWeeklyVwap || isVwapWeeklyView;
                        if (!isFlowMode && showWeekly && weekly) {
                            weeklyMaxSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: weekly.max })));
                            weeklyMinSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: weekly.min })));

                            // Also update price line to show exact value in scale
                            weeklyMaxSeriesRef.current.applyOptions({ priceLineVisible: true });
                            weeklyMinSeriesRef.current.applyOptions({ priceLineVisible: true });

                            // Determine current state for background shading
                            const last = data[data.length - 1];
                            let bgColor = '#0d0f14';
                            if (last) {
                                if (last.close > weekly.max && last.close > weekly.mid) bgColor = 'rgba(16, 185, 129, 0.08)'; // Green
                                else if (last.close > weekly.mid) bgColor = 'rgba(234, 179, 8, 0.08)'; // Yellow
                                else if (last.close > weekly.min) bgColor = 'rgba(59, 130, 246, 0.08)'; // Blue
                                else bgColor = 'rgba(239, 68, 68, 0.08)'; // Red
                            }
                            chartRef.current.applyOptions({
                                layout: { background: { type: ColorType.Solid, color: bgColor } }
                            });
                        } else {
                            weeklyMaxSeriesRef.current.setData([]);
                            weeklyMinSeriesRef.current.setData([]);
                            chartRef.current.applyOptions({
                                layout: { background: { type: ColorType.Solid, color: '#0d0f14' } }
                            });
                        }
                    }

                    // Flow Mode logic... (rest of your existing flow logic remains here)
                    if (isFlowMode && netFlowSeriesRef.current) {
                        let cumulativeDelta = 0;
                        const netFlowData: any[] = [];
                        const cvdData: any[] = [];
                        data.forEach(d => {
                            const buy = d.buyVolume || 0;
                            const sell = d.volume - buy;
                            const delta = buy - sell;
                            cumulativeDelta += delta;
                            netFlowData.push({ time: d.time as any, value: delta, color: delta >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)' });
                            cvdData.push({ time: d.time as any, value: cumulativeDelta });
                        });
                        netFlowSeriesRef.current.setData(netFlowData);
                        cvdSeriesRef.current?.setData(cvdData);
                    } else {
                        netFlowSeriesRef.current?.setData([]);
                        cvdSeriesRef.current?.setData([]);
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
    }, [address, interval, isCex, symbol, showVwap, showVolume, showVolumeCurve, showWeeklyVwap, customScript, activeView]);

    useEffect(() => {
        if (!isCex || !address || loading) return;
        const cleanup = subscribeToKlines(address, interval, (kline) => {
            if (!candlestickSeriesRef.current || !chartRef.current) return;
            const isFlowMode = activeView === 'flow';
            if (!isFlowMode) {
                let color = kline.close >= kline.open ? '#22c55e' : '#ef4444';

                // Real-time Traffic Light Shading & Candle Coloring
                if ((showWeeklyVwap || isVwapWeeklyView) && vwapData) {
                    let bgColor = '#0d0f14';
                    if (kline.close > vwapData.max && kline.close > vwapData.mid) {
                        bgColor = 'rgba(16, 185, 129, 0.08)'; // Green
                        color = '#10b981'; // Emerald highlight
                    }
                    else if (kline.close > vwapData.mid) bgColor = 'rgba(234, 179, 8, 0.08)'; // Yellow
                    else if (kline.close > vwapData.min) bgColor = 'rgba(59, 130, 246, 0.08)'; // Blue
                    else bgColor = 'rgba(239, 68, 68, 0.08)'; // Red

                    chartRef.current.applyOptions({
                        layout: { background: { type: ColorType.Solid, color: bgColor } }
                    });
                }

                candlestickSeriesRef.current.update({
                    time: kline.time as any,
                    open: kline.open,
                    high: kline.high,
                    low: kline.low,
                    close: kline.close,
                    color: color,
                    wickColor: color
                });
                // ... existing volume update ...

                if (showVolume && volumeSeriesRef.current) {
                    volumeSeriesRef.current.update({
                        time: kline.time as any, value: kline.volume, color: kline.close >= kline.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                    });
                }
            }
        });
        return () => cleanup();
    }, [isCex, address, interval, loading, activeView, showVolume, showWeeklyVwap, vwapData]);

    const IndicatorToggle = ({ active, onClick, icon: Icon, label, color }: any) => (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${active
                ? `${color} border-current bg-current/10 font-bold shadow-lg shadow-current/5`
                : 'border-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
        >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">{label}</span>
            {active ? <Eye className="w-3 h-3 ml-0.5" /> : <EyeOff className="w-3 h-3 ml-0.5 opacity-50" />}
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
            {/* Chart Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/20 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-white font-black text-sm tracking-tighter uppercase">{symbol}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-black border border-blue-500/20">
                                {interval}
                            </span>
                            {vwapData && (
                                <div className="flex flex-col gap-0.5 ml-1">
                                    <span className="text-[9px] text-gray-500 font-bold leading-none">
                                        MAX: <span className="text-emerald-500">${vwapData.max.toFixed(4)}</span>
                                    </span>
                                    <span className="text-[9px] text-gray-500 font-bold leading-none">
                                        MIN: <span className="text-rose-500">${vwapData.min.toFixed(4)}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-6 w-px bg-gray-800 mx-2" />

                    <div className="flex items-center gap-2">
                        <IndicatorToggle
                            active={showWeeklyVwap} onClick={() => setShowWeeklyVwap(!showWeeklyVwap)}
                            icon={Layers} label="VWAP WEEKLY" color="text-emerald-400"
                        />
                        <IndicatorToggle
                            active={showVwap} onClick={() => setShowVwap(!showVwap)}
                            icon={Zap} label="VWAP" color="text-blue-500"
                        />
                        <IndicatorToggle
                            active={showVolume} onClick={() => setShowVolume(!showVolume)}
                            icon={BarChart2} label="VOL" color="text-gray-400"
                        />
                        <IndicatorToggle
                            active={showVolumeCurve} onClick={() => setShowVolumeCurve(!showVolumeCurve)}
                            icon={TrendingUp} label="VOL-AVG" color="text-amber-500"
                        />
                    </div>
                </div>

                <div className="flex bg-black/60 rounded-xl p-1 border border-gray-800">
                    {INTERVALS.map((int) => (
                        <button
                            key={int.value}
                            onClick={() => setInterval(int.value)}
                            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${interval === int.value
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {int.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative flex-1 group">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0d0f14]/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                            <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
                            <span className="text-[10px] font-black text-gray-500 animate-pulse">SYNCING DATA...</span>
                        </div>
                    </div>
                )}
                <div ref={chartContainerRef} className="w-full h-full" />
            </div>

            {/* Price Info Footer */}
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-800 bg-gray-900/40">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Market Feed</span>
                    </div>
                    {vwapData && (
                        <div className="flex items-center gap-4 text-[10px] font-bold">
                            <span className="text-gray-500">WEEKLY FLOOR: <span className="text-rose-500">${vwapData.min.toFixed(4)}</span></span>
                            <span className="text-gray-500">DAILY PIVOT: <span className="text-amber-500">${vwapData.mid.toFixed(4)}</span></span>
                        </div>
                    )}
                </div>
                <div className="text-[9px] font-black text-gray-600 italic">
                    POWERED BY BINANCE REAL-TIME DATA ENGINE
                </div>
            </div>
        </div>
    );
};
