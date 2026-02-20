
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle } from 'lightweight-charts';

import { fetchBinanceKlines, subscribeToKlines, fetchWeeklyVwapData } from '../services/cexService';
import { VwapData, OHLCV as TypesOHLCV } from '../types';
import { executeIndicatorScript, OHLCV } from '../services/scriptEngine';
import {
    calculatePDMetrics, classifyDay, calculateLiquidityZones,
    analyzeIntraday, runScenarioEngine, TmaState, calculateATR
} from '../services/tmaService';
import {
    buildVwapMetrics, classifyVwapTrend, analyzeVwapIntraday,
    runVwapScenarioEngine, VwapArchState
} from '../services/vwapArchService';
import { TmaPanel } from './TmaPanel';
import {
    RefreshCcw, Activity, BarChart2, Zap, TrendingUp,
    Layers, Eye, EyeOff, LayoutTemplate
} from 'lucide-react';

interface TokenChartProps {
    address: string;
    symbol: string;
    isCex?: boolean;
    customScript?: string | null;
    activeView?: 'price' | 'flow' | 'vwap_weekly';
    onDivergenceDetected?: (type: 'absorption' | 'trend' | 'none') => void;
    hideTmaPanel?: boolean;
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
    address, symbol, isCex = true, customScript, activeView = 'price', onDivergenceDetected, hideTmaPanel = false
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const volumeCurveSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    // Structural Analytics Refs
    const weeklyMaxSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const weeklyMinSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const customSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const netFlowSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const cvdSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const flowZoneSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

    // TMA Refs
    const pdhSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const pdlSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const pdoSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const pdcSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const midLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const buyZoneSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const sellZoneSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

    // VWAP Fibonacci TP Refs
    const vwapFibRefs = useRef<ISeriesApi<"Line">[]>([]);

    const [interval, setInterval] = useState('15m');
    const [showVwap, setShowVwap] = useState(true);
    const [showVolume, setShowVolume] = useState(false);
    const [showVolumeCurve, setShowVolumeCurve] = useState(false);
    const [showWeeklyVwap, setShowWeeklyVwap] = useState(true);
    const [showTma, setShowTma] = useState(!hideTmaPanel);
    const [tmaState, setTmaState] = useState<TmaState | null>(null);
    const [vwapArchState, setVwapArchState] = useState<VwapArchState | null>(null);
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

        weeklyMaxSeriesRef.current = chart.addLineSeries({ color: '#10b981', lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: true, title: 'W_RANGE_TOP' });
        weeklyMinSeriesRef.current = chart.addLineSeries({ color: '#f43f5e', lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: true, title: 'W_RANGE_BOT' });

        customSeriesRef.current = chart.addLineSeries({ color: '#a855f7', lineWidth: 2, priceLineVisible: false, title: 'Indicator' });
        netFlowSeriesRef.current = chart.addHistogramSeries({ color: '#22c55e', priceFormat: { type: 'volume' }, title: 'Net Flow' });
        cvdSeriesRef.current = chart.addLineSeries({ color: '#facc15', lineWidth: 2, title: 'CVD' });
        flowZoneSeriesRef.current = chart.addAreaSeries({ topColor: 'rgba(34, 197, 94, 0.12)', bottomColor: 'rgba(239, 68, 68, 0.12)', lineVisible: false, priceScaleId: '', title: 'Flow Zones' });

        // TMA Series initialization
        pdhSeriesRef.current = chart.addLineSeries({ color: 'rgba(239, 68, 68, 0.8)', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'PDH' });
        pdlSeriesRef.current = chart.addLineSeries({ color: 'rgba(34, 197, 94, 0.8)', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'PDL' });
        pdoSeriesRef.current = chart.addLineSeries({ color: 'rgba(156, 163, 175, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'PDO' });
        pdcSeriesRef.current = chart.addLineSeries({ color: 'rgba(156, 163, 175, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'PDC' });
        midLineSeriesRef.current = chart.addLineSeries({ color: 'rgba(255, 255, 255, 0.4)', lineWidth: 1, lineStyle: LineStyle.SparseDotted, title: 'PD-MID' });

        buyZoneSeriesRef.current = chart.addAreaSeries({
            topColor: 'rgba(34, 197, 94, 0.05)',
            bottomColor: 'rgba(34, 197, 94, 0.15)',
            lineVisible: false,
            priceLineVisible: false
        });
        sellZoneSeriesRef.current = chart.addAreaSeries({
            topColor: 'rgba(239, 68, 68, 0.15)',
            bottomColor: 'rgba(239, 68, 68, 0.05)',
            lineVisible: false,
            priceLineVisible: false
        });

        // VWAP Fibonacci Lines (inner range + extensions)
        const fibLevels = [
            // Extensions above
            { label: 'W_EXT_2.0', color: 'rgba(168,85,247,0.6)', style: LineStyle.Dashed },
            { label: 'W_EXT_1.618', color: 'rgba(99,102,241,0.6)', style: LineStyle.Dashed },
            { label: 'W_EXT_1.272', color: 'rgba(6,182,212,0.7)', style: LineStyle.Dashed },
            // Inner range levels
            { label: 'W_FIB_0.786', color: 'rgba(234,179,8,0.5)', style: LineStyle.Dotted },
            { label: 'W_FIB_0.618', color: 'rgba(234,179,8,0.6)', style: LineStyle.Dotted },
            { label: 'W_MID', color: 'rgba(255,255,255,0.5)', style: LineStyle.SparseDotted },
            { label: 'W_FIB_0.382', color: 'rgba(234,179,8,0.6)', style: LineStyle.Dotted },
            { label: 'W_FIB_0.236', color: 'rgba(234,179,8,0.5)', style: LineStyle.Dotted },
            // Extensions below
            { label: 'W_EXT_-0.272', color: 'rgba(6,182,212,0.7)', style: LineStyle.Dashed },
            { label: 'W_EXT_-0.618', color: 'rgba(99,102,241,0.6)', style: LineStyle.Dashed },
            { label: 'W_EXT_-1.0', color: 'rgba(168,85,247,0.6)', style: LineStyle.Dashed },
        ];
        vwapFibRefs.current = fibLevels.map(level =>
            chart.addLineSeries({ color: level.color, lineWidth: 1, lineStyle: level.style, priceLineVisible: false, title: level.label })
        );

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
                const [data, weekly, dailyKlines] = await Promise.all([
                    fetchBinanceKlines(symbol, interval),
                    fetchWeeklyVwapData(symbol),
                    fetchBinanceKlines(symbol, '1d', 2)
                ]);

                // TMA Logic Integration
                if (dailyKlines.length >= 2) {
                    const yesterday = dailyKlines[dailyKlines.length - 2];
                    const metrics = calculatePDMetrics(yesterday);
                    const classification = classifyDay(metrics);

                    // Calculate ATR for zone sizing
                    const atr = calculateATR(data, 14);
                    const zones = calculateLiquidityZones(metrics, data[data.length - 1].close, atr);

                    // Filter for today's 15m klines from data if interval is 15m
                    const today15m = interval === '15m' ? data : [];
                    const detectionResult = analyzeIntraday(metrics, today15m);
                    const probabilities = runScenarioEngine(metrics, detectionResult, today15m);

                    let bias: TmaState['current']['bias'] = 'Neutral';
                    if (probabilities.reversal > 50) bias = detectionResult.mss === 'Long' ? 'Reversal Long' : 'Reversal Short';
                    else if (probabilities.continuation > 50) bias = detectionResult.acceptance === 'Above PDH' ? 'Bullish' : 'Bearish';
                    else if (probabilities.range > 50) bias = 'Neutral';

                    const newState: TmaState = {
                        metrics,
                        classification,
                        zones,
                        liquidityTaken: detectionResult.liquidityTaken,
                        current: {
                            ...detectionResult,
                            bias,
                            confidence: Math.max(probabilities.reversal, probabilities.continuation, probabilities.range)
                        },
                        probabilities
                    };
                    setTmaState(newState);

                    // ─── VWAP Architecture Computation ─────────
                    if (weekly) {
                        const vwapMetrics = buildVwapMetrics(weekly);
                        const vwapTrend = classifyVwapTrend(vwapMetrics);
                        const today15mForVwap = interval === '15m' ? data : [];
                        const vwapDetection = analyzeVwapIntraday(vwapMetrics, today15mForVwap);
                        const vwapProbs = runVwapScenarioEngine(vwapMetrics, vwapDetection, today15mForVwap);

                        let vwapBias: VwapArchState['current']['bias'] = 'Neutral';
                        if (vwapProbs.reversal > 50) vwapBias = vwapDetection.mss === 'Long' ? 'Reversal Long' : 'Reversal Short';
                        else if (vwapProbs.continuation > 50) vwapBias = vwapDetection.acceptance === 'Above W-Max' ? 'Bullish' : 'Bearish';

                        setVwapArchState({
                            metrics: vwapMetrics,
                            trend: vwapTrend,
                            liquidityTaken: vwapDetection.liquidityTaken,
                            current: {
                                ...vwapDetection,
                                bias: vwapBias,
                                confidence: Math.max(vwapProbs.reversal, vwapProbs.continuation, vwapProbs.range)
                            },
                            probabilities: vwapProbs
                        });
                    }

                    // Update TMA markers (Sweeps & MSS)
                    if (candlestickSeriesRef.current && today15m.length > 0) {
                        const markers: any[] = [];
                        today15m.forEach((k, i) => {
                            // Buy side sweep
                            if (k.high > metrics.pdh && k.close < metrics.pdh) {
                                markers.push({ time: k.time as any, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: '🔥 PDH SWEEP' });
                            }
                            // Sell side sweep
                            if (k.low < metrics.pdl && k.close > metrics.pdl) {
                                markers.push({ time: k.time as any, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: '🧲 PDL SWEEP' });
                            }
                        });

                        // Add MSS markers
                        if (detectionResult.mss) {
                            markers.push({
                                time: data[data.length - 1].time as any,
                                position: detectionResult.mss === 'Long' ? 'belowBar' : 'aboveBar',
                                color: '#a855f7',
                                shape: 'circle',
                                text: `MSS ${detectionResult.mss === 'Long' ? 'UP' : 'DOWN'}`
                            });
                        }
                        candlestickSeriesRef.current.setMarkers(markers);
                    }

                    // Update TMA visual series
                    if (showTma && pdhSeriesRef.current && pdlSeriesRef.current) {
                        pdhSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: metrics.pdh })));
                        pdlSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: metrics.pdl })));
                        pdoSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: metrics.pdo })));
                        pdcSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: metrics.pdc })));
                        midLineSeriesRef.current.setData(data.map(d => ({ time: d.time as any, value: metrics.mid })));

                        buyZoneSeriesRef.current?.setData(data.map(d => ({ time: d.time as any, value: zones.buySide[1], topValue: zones.buySide[1], bottomValue: zones.buySide[0] })));
                        sellZoneSeriesRef.current?.setData(data.map(d => ({ time: d.time as any, value: zones.sellSide[0], topValue: zones.sellSide[1], bottomValue: zones.sellSide[0] })));
                    } else {
                        pdhSeriesRef.current?.setData([]);
                        pdlSeriesRef.current?.setData([]);
                        pdoSeriesRef.current?.setData([]);
                        pdcSeriesRef.current?.setData([]);
                        midLineSeriesRef.current?.setData([]);
                        buyZoneSeriesRef.current?.setData([]);
                        sellZoneSeriesRef.current?.setData([]);
                    }
                }

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

                            // VWAP Fibonacci Levels (inner + extensions)
                            const wRange = weekly.max - weekly.min;
                            const fibRatios = [
                                2.0, 1.618, 1.272,           // extensions above
                                0.786, 0.618, 0.5, 0.382, 0.236, // inner range
                                -0.272, -0.618, -1.0          // extensions below
                            ];
                            vwapFibRefs.current.forEach((series, i) => {
                                const level = weekly.min + wRange * fibRatios[i];
                                series.setData(data.map(d => ({ time: d.time as any, value: level })));
                            });

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
                            vwapFibRefs.current.forEach(s => s.setData([]));
                            chartRef.current.applyOptions({ layout: { background: { type: ColorType.Solid, color: '#0d0f14' } } });
                        }
                    }

                    chartRef.current.timeScale().fitContent();
                }
            } catch (err: any) { setError(err.message); } finally { setLoading(false); }
        };
        fetchData();
    }, [address, interval, symbol, showVwap, showVolume, showVolumeCurve, showWeeklyVwap, showTma, activeView]);

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
                        {!hideTmaPanel && <IndicatorToggle active={showTma} onClick={() => setShowTma(!showTma)} icon={LayoutTemplate} label="ARCHITECTURE (TMA)" color="text-indigo-400" />}
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
            <div className="flex-1 flex flex-wrap xl:flex-nowrap overflow-hidden group">
                <div className="flex-1 relative">
                    {loading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0d0f14]/80 backdrop-blur-sm">
                            <div className="flex flex-col items-center gap-3"><RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" /><span className="text-[10px] font-black text-gray-500 animate-pulse">SYNCING DATA...</span></div>
                        </div>
                    )}
                    <div ref={chartContainerRef} className="w-full h-full" />

                    {/* Market State Pill Overlay */}
                    {showTma && tmaState && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 pointer-events-none">
                            <div className={`px-4 py-1.5 rounded-full border shadow-2xl backdrop-blur-md flex items-center gap-3 ${tmaState.current.state === 'ACCEPT ABOVE' || tmaState.current.state === 'ACCEPT BELOW' ? 'bg-red-500/20 border-red-500/40' :
                                tmaState.current.state === 'SWEEPING LIQUIDITY' ? 'bg-amber-500/20 border-amber-500/40' :
                                    'bg-blue-500/20 border-blue-500/40'
                                }`}>
                                <div className={`w-2 h-2 rounded-full animate-pulse ${tmaState.current.state === 'ACCEPT ABOVE' || tmaState.current.state === 'ACCEPT BELOW' ? 'bg-red-500' :
                                    tmaState.current.state === 'SWEEPING LIQUIDITY' ? 'bg-amber-500' :
                                        'bg-blue-500'
                                    }`} />
                                <span className="text-[11px] font-black text-white tracking-[0.2em] uppercase">
                                    {tmaState.current.state}
                                </span>
                            </div>
                            {tmaState.current.mss && (
                                <div className="px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center gap-2">
                                    <Zap className="w-3 h-3 text-purple-400" />
                                    <span className="text-[9px] font-black text-purple-400 tracking-wider">STRUCTURE SHIFT: {tmaState.current.mss}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {showTma && (
                    <div className="w-full xl:w-[380px] xl:border-l border-t xl:border-t-0 border-gray-800 bg-[#06080c]/50 backdrop-blur-xl overflow-y-auto p-6 max-h-[600px] xl:max-h-none">
                        <TmaPanel symbol={symbol} state={tmaState} isLoading={loading} />
                    </div>
                )}
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
