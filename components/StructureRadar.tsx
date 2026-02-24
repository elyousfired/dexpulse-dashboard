
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker } from '../types';
import { fetchBinanceKlines } from '../services/cexService';
import { findPivots, analyzeBullishStructure, StructureResult } from '../services/structureMathService';
import {
    TrendingUp,
    ChevronUp,
    Activity,
    Clock,
    Target,
    ChevronRight,
    Loader2,
    RefreshCw,
    BarChart3,
    ArrowUpRight,
    AlertCircle
} from 'lucide-react';

interface StructureRadarProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

export const StructureRadar: React.FC<StructureRadarProps> = ({ tickers, onTickerClick }) => {
    const [results, setResults] = useState<StructureResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [timeframe, setTimeframe] = useState<'4h' | '1d'>('4h');

    const loadRadar = async () => {
        setLoading(true);
        const newResults: StructureResult[] = [];

        // Focus on top 40 tickers by volume for performance
        const targetTickers = tickers.slice(0, 40);

        const BATCH_SIZE = 5;
        for (let i = 0; i < targetTickers.length; i += BATCH_SIZE) {
            const batch = targetTickers.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (ticker) => {
                try {
                    const klines = await fetchBinanceKlines(ticker.symbol, timeframe, 100);
                    if (klines.length < 20) return;

                    const pivots = findPivots(klines, 3);
                    const analysis = analyzeBullishStructure(pivots);

                    newResults.push({
                        symbol: ticker.symbol,
                        timeframe: timeframe,
                        trend: analysis.trend,
                        markers: analysis.markers,
                        score: analysis.score,
                        lastUpdated: Date.now()
                    });
                } catch (err) {
                    console.error(`[StructureRadar] Error for ${ticker.symbol}:`, err);
                }
            }));
        }

        setResults(newResults.sort((a, b) => b.score - a.score));
        setLoading(false);
        setLastRefresh(new Date());
    };

    useEffect(() => {
        loadRadar();
        const interval = setInterval(loadRadar, 15 * 60 * 1000); // 15 min refresh
        return () => clearInterval(interval);
    }, [timeframe, tickers.length > 0]);

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-emerald-500/10 shadow-3xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-900/10 via-transparent to-blue-900/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                        <TrendingUp className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic flex items-center gap-2">
                            Bullish Structure Radar
                            <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">HH-HL DETECTIVE</span>
                        </h2>
                        <p className="text-xs text-emerald-400/60 font-medium font-mono uppercase tracking-widest leading-none mt-1">High Timeframe Trend Confirmation ({timeframe})</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-black/40 p-1 rounded-xl border border-gray-800">
                        {(['4h', '1d'] as const).map(tf => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${timeframe === tf ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={loadRadar}
                        disabled={loading}
                        className="p-3 bg-gray-900 hover:bg-gray-800 rounded-xl border border-gray-800 transition-all active:scale-95"
                    >
                        {loading ? <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" /> : <RefreshCw className="w-5 h-5 text-gray-400" />}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                {loading && results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-4">
                        <Activity className="w-12 h-12 text-emerald-500 animate-pulse" />
                        <p className="text-sm font-black tracking-widest uppercase text-emerald-400/60">Scanning Structural Extremas...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {results.map((res) => {
                            const ticker = tickers.find(t => t.symbol === res.symbol);
                            const latestMarkers = res.markers.slice(-4);

                            return (
                                <button
                                    key={res.symbol}
                                    onClick={() => ticker && onTickerClick(ticker)}
                                    className={`group flex flex-col p-5 bg-[#12141c] border rounded-2xl transition-all duration-300 hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)] active:scale-[0.98] ${res.trend === 'BULLISH' ? 'border-emerald-500/20' : 'border-gray-800'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center font-black text-white group-hover:text-emerald-400 border border-gray-700">
                                                {res.symbol[0]}
                                            </div>
                                            <div className="text-left">
                                                <div className="text-base font-black text-white group-hover:text-emerald-400">{res.symbol}</div>
                                                <div className="text-[10px] font-bold text-gray-500 uppercase font-mono">${ticker?.priceUsd.toLocaleString()}</div>
                                            </div>
                                        </div>
                                        {res.trend === 'BULLISH' && (
                                            <div className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black border border-emerald-500/30 animate-pulse">
                                                BULLISH STRUC
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        {/* Strength Bar */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Trend Strength</span>
                                                <span className="text-[10px] font-black text-emerald-400">{res.score}%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden border border-white/5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-emerald-600 to-blue-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000"
                                                    style={{ width: `${res.score}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Marker Train */}
                                        <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                                            {latestMarkers.length === 0 ? (
                                                <span className="text-[10px] text-gray-600 font-bold uppercase mx-auto italic">Waiting for confirmations</span>
                                            ) : (
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    {latestMarkers.map((m, idx) => (
                                                        <React.Fragment key={idx}>
                                                            <div className={`flex flex-col items-center ${m.label.startsWith('H') ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                                <span className="text-[10px] font-black">{m.label}</span>
                                                                <span className="text-[8px] font-mono text-gray-600">${m.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                            {idx < latestMarkers.length - 1 && <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" />}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between text-[10px]">
                                            <div className="flex flex-col">
                                                <span className="text-gray-600 font-bold uppercase mb-0.5">Vol-24H</span>
                                                <span className="text-white font-mono">${((ticker?.volume24h || 0) / 1000000).toFixed(1)}M</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-gray-600 font-bold uppercase mb-0.5">Last Phase</span>
                                                <span className={`flex items-center gap-1 font-black ${res.trend === 'BULLISH' ? 'text-emerald-400' : 'text-gray-500'}`}>
                                                    {res.trend} <ArrowUpRight className="w-3 h-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-emerald-500/5 border-t border-emerald-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                        HH-HL pattern confirmed on Higher Timeframes provides institutional trend safety.
                    </span>
                </div>
                <div className="text-[9px] text-gray-600 font-bold uppercase italic">
                    Sync Status: {lastRefresh.toLocaleTimeString()}
                </div>
            </div>
        </div>
    );
};
