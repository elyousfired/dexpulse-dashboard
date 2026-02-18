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
    const isVwapWeeklyView = activeView === 'vwap_weekly';

    // State to persist cumulative values for real-time VWAP
    const cumulativeRef = useRef({ quote: 0, base: 0, lastDay: -1 });

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
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
            timeScale: { timeVisible: true, borderColor: '#1f2937', rightOffset: 20, barSpacing: 8, minBarSpacing: 1 },
            rightPriceScale: { borderColor: '#1f2937', autoScale: true, alignLabels: true },
            crosshair: { mode: 1, vertLine: { labelBackgroundColor: '#3b82f6' }, horzLine: { labelBackgroundColor: '#3b82f6' } },
        });

        candlestickSeriesRef.current = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
        volumeSeriesRef.current = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
        vwapSeriesRef.current = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, priceLineVisible: false, title: 'VWAP (1D)' });
        volumeCurveSeriesRef.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, priceScaleId: '', title: 'Vol Curve' });

        weeklyMaxSeriesRef.current = chart.addLineSeries({ color: '#10b981', lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: true, title: 'WEEKLY MAX' });
        weeklyMinSeriesRef.current = chart.addLineSeries({ color: '#f43f5e', lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: true, title: 'WEEKLY MIN' });

        customSeriesRef.current = chart.addLineSeries({ color: '#a855f7', lineWidth: 2, priceLineVisible: false, title: 'Indicator' });
        netFlowSeriesRef.current = chart.addHistogramSeries({ color: '#22c55e', priceFormat: { type: 'volume' }, title: 'Net Flow' });
        cvdSeriesRef.current = chart.addLineSeries({ color: '#facc15', lineWidth: 2, title: 'CVD' });
        flowZoneSeriesRef.current = chart.addAreaSeries({ topColor: 'rgba(34, 197, 94, 0.12)', bottomColor: 'rgba(239, 68, 68, 0.12)', lineVisible: false, priceScaleId: '', title: 'Flow Zones' });

        volumeSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volumeCurveSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        chartRef.current = chart;

        const handleResize = () => { if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth }); };
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
                const [data, weekly] = await Promise.all([
                    fetchBinanceKlines(symbol, interval),
                    fetchWeeklyVwapData(symbol)
                ]);

                setVwapData(weekly);

                if (chartRef.current && candlestickSeriesRef.current) {
                    const isFlowMode = activeView === 'flow';

                    // 1. Candlesticks
                    candlestickSeriesRef.current.setData(isFlowMode ? [] : data.map(d => {
                        let c = d.close >= d.open ? '#22c55e' : '#ef4444';
                        if (weekly && d.close > weekly.max && d.close > weekly.mid) c = '#10b981';
                        return { time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close, color: c, wickColor: c };
                    }));

                    // 2. Volume
                    if (volumeSeriesRef.current) {
                        volumeSeriesRef.current.setData(!isFlowMode && showVolume ? data.map(d => ({
                            time: d.time as any, value: d.volume,
                            color: d.close >= d.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                        })) : []);
                    }

                    // 3. Day-Anchored VWAP with Slope Coloring
                    if (vwapSeriesRef.current) {
                        if (!isFlowMode && showVwap) {
                            // Slope parameters
                            const SLOPE_LOOKBACK = 10;
                            const ATR_LENGTH = 14;
                            const NEAR_ZERO_THRESHOLD = 0.05;

                            // Step 1: Compute raw VWAP values
                            let qVol = 0, bVol = 0, lastDay = -1;
                            const rawVwap = data.map(d => {
                                const day = new Date(d.time * 1000).getUTCDate();
                                if (lastDay !== -1 && day !== lastDay) { qVol = 0; bVol = 0; }
                                lastDay = day;
                                qVol += d.quoteVolume || (d.close * d.volume);
                                bVol += d.volume;
                                return { time: d.time, value: bVol > 0 ? qVol / bVol : d.close };
                            });

                            // Step 2: Compute ATR(14) for normalization
                            const trueRanges: number[] = data.map((d, i) => {
                                if (i === 0) return d.high - d.low;
                                const prevClose = data[i - 1].close;
                                return Math.max(d.high - d.low, Math.abs(d.high - prevClose), Math.abs(d.low - prevClose));
                            });
                            const atrValues: number[] = trueRanges.map((_, i) => {
                                if (i < ATR_LENGTH - 1) return 0;
                                const slice = trueRanges.slice(i - ATR_LENGTH + 1, i + 1);
                                return slice.reduce((s, v) => s + v, 0) / ATR_LENGTH;
                            });

                            // Step 3: Compute slope and assign color per point
                            const vValues = rawVwap.map((v, i) => {
                                let color = '#3b82f6'; // default blue (near-zero / no data)
                                if (i >= SLOPE_LOOKBACK && atrValues[i] > 0) {
                                    const slope = v.value - rawVwap[i - SLOPE_LOOKBACK].value;
                                    const normalizedSlope = slope / atrValues[i];
                                    if (normalizedSlope > NEAR_ZERO_THRESHOLD) {
                                        color = '#facc15'; // yellow — positive slope
                                    } else if (normalizedSlope < -NEAR_ZERO_THRESHOLD) {
                                        color = '#f43f5e'; // rose — negative slope
                                    }
                                }
                                return { time: v.time as any, value: v.value, color };
                            });

                            vwapSeriesRef.current.setData(vValues);
                            cumulativeRef.current = { quote: qVol, base: bVol, lastDay: lastDay };
                        } else vwapSeriesRef.current.setData([]);
                    }

                    // 4. Volume Curve
                    if (volumeCurveSeriesRef.current) {
                        if (!isFlowMode && showVolumeCurve) {
                            volumeCurveSeriesRef.current.setData(data.map((d, i, arr) => {
                                const slice = arr.slice(Math.max(0, i - 19), i + 1);
                                const avg = slice.reduce((s, c) => s + c.volume, 0) / slice.length;
                                return { time: d.time as any, value: avg };
                            }));
                        } else volumeCurveSeriesRef.current.setData([]);
                    }

                    // 5. Weekly structural lines
                    if (weeklyMaxSeriesRef.current && weeklyMinSeriesRef.current) {
                        const showWeekly = showWeeklyVwap || isVwapWeeklyView;
                        if (!isFlowMode && showWeekly && weekly) {
                            weeklyMaxSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: weekly.max })));
                            weeklyMinSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: weekly.min })));

                            const last = data[data.length - 1];
                            let bg = '#0d0f14';
                            if (last) {
                                if (last.close > weekly.max && last.close > weekly.mid) bg = 'rgba(16, 185, 129, 0.08)';
                                else if (last.close > weekly.mid) bg = 'rgba(234, 179, 8, 0.08)';
                                else if (last.close > weekly.min) bg = 'rgba(59, 130, 246, 0.08)';
                                else bg = 'rgba(239, 68, 68, 0.08)';
                            }
                            chartRef.current.applyOptions({ layout: { background: { type: ColorType.Solid, color: bg } } });
                        } else {
                            weeklyMaxSeriesRef.current.setData([]);
                            weeklyMinSeriesRef.current.setData([]);
                            chartRef.current.applyOptions({ layout: { background: { type: ColorType.Solid, color: '#0d0f14' } } });
                        }
                    }

                    chartRef.current.timeScale().fitContent();
                }
            } catch (err: any) { setError(err.message); } finally { setLoading(false); }
        };
        fetchData();
    }, [address, interval, symbol, showVwap, showVolume, showVolumeCurve, showWeeklyVwap, activeView]);

    useEffect(() => {
        if (!isCex || !address || loading) return;
        const cleanup = subscribeToKlines(address, interval, (kline) => {
            if (!candlestickSeriesRef.current || !chartRef.current) return;
            const isFlowMode = activeView === 'flow';
            if (!isFlowMode) {
                let candleColor = kline.close >= kline.open ? '#22c55e' : '#ef4444';

                // Real-time Traffic Light
                if ((showWeeklyVwap || isVwapWeeklyView) && vwapData) {
                    let bg = '#0d0f14';
                    if (kline.close > vwapData.max && kline.close > vwapData.mid) { bg = 'rgba(16, 185, 129, 0.08)'; candleColor = '#10b981'; }
                    else if (kline.close > vwapData.mid) bg = 'rgba(234, 179, 8, 0.08)';
                    else if (kline.close > vwapData.min) bg = 'rgba(59, 130, 246, 0.08)';
                    else bg = 'rgba(239, 68, 68, 0.08)';
                    chartRef.current.applyOptions({ layout: { background: { type: ColorType.Solid, color: bg } } });
                }

                candlestickSeriesRef.current.update({
                    time: kline.time as any, open: kline.open, high: kline.high, low: kline.low, close: kline.close,
                    color: candleColor, wickColor: candleColor
                });

                if (showVolume && volumeSeriesRef.current) {
                    volumeSeriesRef.current.update({
                        time: kline.time as any, value: kline.volume,
                        color: kline.close >= kline.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                    });
                }

                if (showVwap && vwapSeriesRef.current) {
                    const day = new Date(kline.time * 1000).getUTCDate();
                    if (cumulativeRef.current.lastDay !== -1 && day !== cumulativeRef.current.lastDay) {
                        cumulativeRef.current = { quote: 0, base: 0, lastDay: day };
                    }
                    // Approx update using latest kline increment
                    const qInc = kline.quoteVolume || (kline.close * kline.volume);
                    const bInc = kline.volume;
                    const liveVwap = (cumulativeRef.current.base + bInc) > 0
                        ? (cumulativeRef.current.quote + qInc) / (cumulativeRef.current.base + bInc)
                        : kline.close;

                    vwapSeriesRef.current.update({ time: kline.time as any, value: liveVwap });

                    // Note: In a production app, we'd update refs on 'isFinal' to strictly keep prefix sums.
                    if (kline.isFinal) {
                        cumulativeRef.current.quote += qInc;
                        cumulativeRef.current.base += bInc;
                    }
                }
            }
        });
        return () => cleanup();
    }, [isCex, address, interval, loading, activeView, showVolume, showVwap, showWeeklyVwap, vwapData]);

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
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/20 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-white font-black text-sm tracking-tighter uppercase">{symbol}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-black border border-blue-500/20">{interval}</span>
                            {vwapData && (
                                <div className="flex flex-col gap-0.5 ml-1">
                                    <span className="text-[9px] text-gray-500 font-bold leading-none">MAX: <span className="text-emerald-500">${vwapData.max.toFixed(4)}</span></span>
                                    <span className="text-[9px] text-gray-500 font-bold leading-none">MIN: <span className="text-rose-500">${vwapData.min.toFixed(4)}</span></span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="h-6 w-px bg-gray-800 mx-2" />
                    <div className="flex items-center gap-2">
                        <IndicatorToggle active={showWeeklyVwap} onClick={() => setShowWeeklyVwap(!showWeeklyVwap)} icon={Layers} label="VWAP WEEKLY" color="text-emerald-400" />
                        <IndicatorToggle active={showVwap} onClick={() => setShowVwap(!showVwap)} icon={Zap} label="VWAP" color="text-blue-500" />
                        <IndicatorToggle active={showVolume} onClick={() => setShowVolume(!showVolume)} icon={BarChart2} label="VOL" color="text-gray-400" />
                        <IndicatorToggle active={showVolumeCurve} onClick={() => setShowVolumeCurve(!showVolumeCurve)} icon={TrendingUp} label="VOL-AVG" color="text-amber-500" />
                    </div>
                </div>
                <div className="flex bg-black/60 rounded-xl p-1 border border-gray-800">
                    {INTERVALS.map((int) => (
                        <button key={int.value} onClick={() => setInterval(int.value)} className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${interval === int.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}>{int.label}</button>
                    ))}
                </div>
            </div>
            <div className="relative flex-1 group">
                {loading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0d0f14]/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3"><RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" /><span className="text-[10px] font-black text-gray-500 animate-pulse">SYNCING DATA...</span></div>
                    </div>
                )}
                <div ref={chartContainerRef} className="w-full h-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-800 bg-gray-900/40">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-blue-500" /><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Market Feed</span></div>
                    {vwapData && (
                        <div className="flex items-center gap-4 text-[10px] font-bold">
                            <span className="text-gray-500">WEEKLY FLOOR: <span className="text-rose-500">${vwapData.min.toFixed(4)}</span></span>
                            <span className="text-gray-500">DAILY PIVOT: <span className="text-amber-500">${vwapData.mid.toFixed(4)}</span></span>
                        </div>
                    )}
                </div>
                <div className="text-[9px] font-black text-gray-600 italic">POWERED BY BINANCE REAL-TIME DATA ENGINE</div>
            </div>
        </div>
    );
};
