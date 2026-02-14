
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker } from '../types';
import { fetchWeeklyVwapMax, formatPrice } from '../services/cexService';
import { Activity, ArrowUpRight, Clock, Search } from 'lucide-react';

interface VwapScannerProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

interface ScannerResult {
    ticker: CexTicker;
    weeklyMax: number;
    distance: number;
    isBreaking: boolean;
    breakTime: number | null;
}

export const VwapScanner: React.FC<VwapScannerProps> = ({ tickers, onTickerClick }) => {
    const [weeklyMaxes, setWeeklyMaxes] = useState<Record<string, number>>({});
    const [breakHistory, setBreakHistory] = useState<Record<string, number>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Initial load of weekly maxes for all tickers
    useEffect(() => {
        const loadMaxes = async () => {
            setIsLoading(true);
            const results: Record<string, number> = {};

            // Limit to top 100 for scanner performance if needed, but let's try top tickers
            const targetSymbols = tickers.slice(0, 100);

            // Fetch in chunks to avoid rate limits
            const CHUNK_SIZE = 10;
            for (let i = 0; i < targetSymbols.length; i += CHUNK_SIZE) {
                const chunk = targetSymbols.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (t) => {
                    const max = await fetchWeeklyVwapMax(t.symbol);
                    if (max) results[t.id] = max;
                }));
            }

            setWeeklyMaxes(results);
            setIsLoading(false);
        };

        loadMaxes();
    }, [tickers]);

    // Compute scanner results
    const results = useMemo(() => {
        return tickers
            .map(t => {
                const max = weeklyMaxes[t.id];
                if (!max) return null;

                const isBreaking = t.priceUsd > max;
                const distance = ((t.priceUsd - max) / max) * 100;

                return {
                    ticker: t,
                    weeklyMax: max,
                    distance,
                    isBreaking,
                    breakTime: isBreaking ? (breakHistory[t.id] || Date.now()) : null
                } as ScannerResult;
            })
            .filter((r): r is ScannerResult => r !== null && (searchTerm === '' || r.ticker.symbol.toLowerCase().includes(searchTerm.toLowerCase())))
            .sort((a, b) => {
                // Primary sort: Breaking status
                if (a.isBreaking && !b.isBreaking) return -1;
                if (!a.isBreaking && b.isBreaking) return 1;

                // Secondary sort: Freshness of breakout (if breaking)
                if (a.isBreaking && b.isBreaking) {
                    return (b.breakTime || 0) - (a.breakTime || 0);
                }

                // Tertiary sort: distance from max
                return b.distance - a.distance;
            });
    }, [tickers, weeklyMaxes, breakHistory, searchTerm]);

    // Update break history when a new breakout is detected
    useEffect(() => {
        const now = Date.now();
        const newHistory = { ...breakHistory };
        let changed = false;

        tickers.forEach(t => {
            const max = weeklyMaxes[t.id];
            if (max && t.priceUsd > max && !breakHistory[t.id]) {
                newHistory[t.id] = now;
                changed = true;
            } else if (max && t.priceUsd <= max && breakHistory[t.id]) {
                delete newHistory[t.id];
                changed = true;
            }
        });

        if (changed) setBreakHistory(newHistory);
    }, [tickers, weeklyMaxes, breakHistory]);

    if (isLoading && Object.keys(weeklyMaxes).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
                <div className="w-8 h-8 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
                <p className="text-sm font-medium animate-pulse">Scanning Weekly VWAP Levels...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0f14]/50 rounded-xl border border-gray-800/50 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/10 rounded-lg">
                        <Activity className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                            VWAP ENERGY SCAN
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-yellow-500/20 text-yellow-500 border border-yellow-500/20">W-MAX (1D)</span>
                        </h2>
                        <p className="text-[10px] text-gray-500">Detecting price breakouts above weekly resistance</p>
                    </div>
                </div>

                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Filter symbols..."
                        className="w-full bg-black/40 border border-gray-800 rounded-lg py-1.5 pl-9 pr-4 text-xs text-gray-200 focus:outline-none focus:border-yellow-500/50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {results.map((res) => (
                        <button
                            key={res.ticker.id}
                            onClick={() => onTickerClick(res.ticker)}
                            className={`flex flex-col p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${res.isBreaking
                                    ? 'bg-green-500/10 border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                                    : 'bg-gray-900/40 border-gray-800 hover:border-gray-700'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-white">{res.ticker.symbol}</span>
                                    {res.isBreaking && (
                                        <div className="px-1.5 py-0.5 rounded-[4px] bg-green-500 text-[10px] font-black italic animate-pulse">
                                            LIVE BREAKOUT
                                        </div>
                                    )}
                                </div>
                                <span className={`text-[10px] font-mono ${res.isBreaking ? 'text-green-400' : 'text-gray-400'}`}>
                                    ${formatPrice(res.ticker.priceUsd)}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-500">Weekly Max</span>
                                    <span className="text-gray-300">${formatPrice(res.weeklyMax)}</span>
                                </div>

                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${res.isBreaking ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-yellow-500/50'}`}
                                        style={{ width: `${Math.min(100, Math.max(0, (res.ticker.priceUsd / res.weeklyMax) * 100))}%` }}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                        {res.isBreaking ? (
                                            <ArrowUpRight className="w-3 h-3 text-green-500" />
                                        ) : (
                                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                                        )}
                                        <span className={`text-[11px] font-bold ${res.isBreaking ? 'text-green-500' : 'text-gray-500'}`}>
                                            {res.distance >= 0 ? '+' : ''}{res.distance.toFixed(2)}%
                                        </span>
                                    </div>
                                    {res.isBreaking && (
                                        <div className="flex items-center gap-1 text-[9px] text-green-500/70">
                                            <Clock className="w-2.5 h-2.5" />
                                            <span>Active</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {results.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500">
                        <Activity className="w-10 h-10 mb-4 opacity-20" />
                        <p className="text-sm">No pairs matching current filter</p>
                    </div>
                )}
            </div>
        </div>
    );
};
