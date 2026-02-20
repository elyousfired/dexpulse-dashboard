
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker, VwapData } from '../types';
import { fetchWeeklyVwapData, formatPrice } from '../services/cexService';
import { Activity, ArrowUpRight, Clock, Search, ShieldCheck } from 'lucide-react';

interface VwapScannerProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

type VwapState = 'green' | 'yellow' | 'blue' | 'red';

interface ScannerResult {
    ticker: CexTicker;
    vwap: VwapData;
    state: VwapState;
    distanceMax: number;
    readyCnt: number;
}

export const VwapScanner: React.FC<VwapScannerProps> = ({ tickers, onTickerClick }) => {
    const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
    const [readyCounters, setReadyCounters] = useState<Record<string, number>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Initial load of weekly structural data (rate-limit safe)
    useEffect(() => {
        let cancelled = false;
        const loadVwapData = async () => {
            setIsLoading(true);
            const results: Record<string, VwapData> = {};

            // Top 120 by volume
            const targetSymbols = tickers.filter(t => t.volume24h > 500000).slice(0, 120);

            const CHUNK_SIZE = 5;
            const DELAY_MS = 600; // Avoid Binance rate limits

            for (let i = 0; i < targetSymbols.length; i += CHUNK_SIZE) {
                if (cancelled) break;
                const chunk = targetSymbols.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (t) => {
                    try {
                        const data = await fetchWeeklyVwapData(t.symbol);
                        if (data) results[t.id] = data;
                    } catch { /* skip failed */ }
                }));

                // Show results incrementally as they load
                if (!cancelled) setVwapStore({ ...results });

                // Rate-limit delay between chunks
                if (i + CHUNK_SIZE < targetSymbols.length) {
                    await new Promise(r => setTimeout(r, DELAY_MS));
                }
            }

            if (!cancelled) {
                setVwapStore(results);
                setIsLoading(false);
            }
        };

        if (tickers.length > 0) loadVwapData();
        return () => { cancelled = true; };
    }, [tickers.length > 0]); // Reload only if ticker list changes significantly

    // Compute scanner results with 4-level logic
    const results = useMemo(() => {
        return tickers
            .map(t => {
                const vwap = vwapStore[t.id];
                if (!vwap) return null;

                const price = t.priceUsd;

                // Logic Matrix:
                // GREEN: Price > Max && Price > Mid && Price > Min
                // YELLOW: Price > Mid
                // BLUE: Price > Min
                // RED: Price < All

                let state: VwapState = 'red';
                if (price > vwap.max && price > vwap.mid && price > vwap.min) {
                    state = 'green';
                } else if (price > vwap.mid) {
                    state = 'yellow';
                } else if (price > vwap.min) {
                    state = 'blue';
                }

                const distanceMax = ((price - vwap.max) / vwap.max) * 100;

                return {
                    ticker: t,
                    vwap,
                    state,
                    distanceMax,
                    readyCnt: readyCounters[t.id] || 0
                } as ScannerResult;
            })
            .filter((r): r is ScannerResult => r !== null && (searchTerm === '' || r.ticker.symbol.toLowerCase().includes(searchTerm.toLowerCase())))
            .sort((a, b) => {
                // Priority: Green -> Yellow -> Blue -> Red
                const weights = { green: 4, yellow: 3, blue: 2, red: 1 };
                if (weights[a.state] !== weights[b.state]) {
                    return weights[b.state] - weights[a.state];
                }

                // Secondary: Sorting within states
                if (a.state === 'green') {
                    // Highest confirmation first
                    if (b.readyCnt !== a.readyCnt) return b.readyCnt - a.readyCnt;
                    return b.distanceMax - a.distanceMax;
                }

                // Default sorting by 24h gain for others
                return b.ticker.priceChangePercent24h - a.ticker.priceChangePercent24h;
            });
    }, [tickers, vwapStore, readyCounters, searchTerm]);

    // Update ready counters when in Green state
    useEffect(() => {
        setReadyCounters(prev => {
            const next = { ...prev };
            let changed = false;

            tickers.forEach(t => {
                const vwap = vwapStore[t.id];
                if (!vwap) return;

                const isGreen = t.priceUsd > vwap.max && t.priceUsd > vwap.mid && t.priceUsd > vwap.min;

                if (isGreen) {
                    next[t.id] = (next[t.id] || 0) + 1;
                    changed = true;
                } else if (next[t.id]) {
                    delete next[t.id];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [tickers]);

    if (isLoading && Object.keys(vwapStore).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
                <div className="w-8 h-8 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
                <p className="text-sm font-medium animate-pulse">Computing Structural VWAP Levels...</p>
            </div>
        );
    }

    const stateColors = {
        green: 'border-green-500/40 bg-green-500/5 shadow-[0_0_25px_rgba(34,197,94,0.1)]',
        yellow: 'border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_20px_rgba(234,179,8,0.05)]',
        blue: 'border-blue-500/30 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.05)]',
        red: 'border-red-500/20 bg-red-500/5 opacity-70 grayscale-[0.5]'
    };

    const stateText = {
        green: 'FULL LONG',
        yellow: 'MOMENTUM',
        blue: 'RECOVERY',
        red: 'SHORT'
    };

    const stateBadge = {
        green: 'bg-green-500 text-white',
        yellow: 'bg-yellow-500 text-black font-bold',
        blue: 'bg-blue-500 text-white',
        red: 'bg-red-500/20 text-red-500 border border-red-500/30'
    };

    return (
        <div className="flex flex-col h-full bg-[#0d0f14]/80 rounded-2xl border border-gray-800 backdrop-blur-xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-900/50 to-transparent">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                        <Activity className="w-6 h-6 text-yellow-500" />
                    </div>
                    <div>
                        <h2 className="text-base font-black tracking-tighter text-white flex items-center gap-2">
                            TRAFFIC LIGHT SCANNER
                            <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-gray-400 border border-white/10">W-from-1D</span>
                        </h2>
                        <p className="text-[11px] text-gray-500 font-medium">Weekly structural breakout & momentum tracking</p>
                    </div>
                </div>

                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                        type="text"
                        placeholder="Search for breakouts..."
                        className="w-full bg-black/60 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-100 transition-all focus:outline-none focus:border-yellow-500/50 hover:border-gray-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                    {results.map((res) => (
                        <button
                            key={res.ticker.id}
                            onClick={() => onTickerClick(res.ticker)}
                            className={`group flex flex-col p-4 rounded-2xl border transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] ${stateColors[res.state]}`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-white group-hover:text-yellow-400 transition-colors">
                                        {res.ticker.symbol}
                                    </span>
                                    <div className={`px-2 py-0.5 rounded-[6px] text-[10px] font-black tracking-tight ${stateBadge[res.state]}`}>
                                        {stateText[res.state]}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-mono font-bold text-white">${formatPrice(res.ticker.priceUsd)}</div>
                                    <div className={`text-[10px] font-bold ${res.ticker.priceChangePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {res.ticker.priceChangePercent24h >= 0 ? '+' : ''}{res.ticker.priceChangePercent24h.toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {/* Structural Levels View */}
                                <div className="grid grid-cols-2 gap-2 p-2 bg-black/40 rounded-lg border border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-gray-500 font-bold uppercase">W-Max</span>
                                        <span className="text-[11px] text-gray-300 font-mono">${formatPrice(res.vwap.max)}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[9px] text-gray-500 font-bold uppercase">W-Min</span>
                                        <span className="text-[11px] text-gray-300 font-mono">${formatPrice(res.vwap.min)}</span>
                                    </div>
                                </div>

                                {/* Confirmation Indicator */}
                                {res.state === 'green' && (
                                    <div className="flex items-center justify-between px-2 py-1 bg-green-500/20 rounded-md border border-green-500/20">
                                        <div className="flex items-center gap-1.5">
                                            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                                            <span className="text-[10px] font-black text-green-400">VW_READY</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {[...Array(3)].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-1.5 h-1.5 rounded-full ${res.readyCnt > i ? 'bg-green-400 shadow-[0_0_5px_#4ade80]' : 'bg-green-900/40'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-1">
                                        {res.state !== 'red' ? (
                                            <ArrowUpRight className={`w-3.5 h-3.5 ${res.state === 'green' ? 'text-green-500' : res.state === 'yellow' ? 'text-yellow-500' : 'text-blue-500'}`} />
                                        ) : (
                                            <div className="w-2 h-2 rounded-full bg-red-500/40" />
                                        )}
                                        <span className={`text-xs font-black ${res.state === 'green' ? 'text-green-400' : res.state === 'yellow' ? 'text-yellow-400' : res.state === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                                            {res.distanceMax >= 0 ? '+' : ''}{res.distanceMax.toFixed(2)}%
                                        </span>
                                    </div>
                                    <div className="text-[9px] font-bold text-gray-600 italic">
                                        MID: ${formatPrice(res.vwap.mid)}
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {results.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500">
                        <div className="w-16 h-16 rounded-full bg-gray-800/20 flex items-center justify-center mb-4">
                            <Activity className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-sm font-bold tracking-tight">No signals matching your search</p>
                        <p className="text-xs text-gray-600 mt-1">Try searching for another ticker symbol</p>
                    </div>
                )}
            </div>
        </div>
    );
};
