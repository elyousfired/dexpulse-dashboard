
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker, VwapData } from '../types';
import { fetchWeeklyVwapData, formatPrice } from '../services/cexService';
import { Anchor, ArrowUpCircle, TrendingUp, Info, Zap, Waves, Activity, Fish } from 'lucide-react';

interface WhaleScannerProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

interface AccumulationResult {
    ticker: CexTicker;
    vwap: VwapData;
    intensity: number; // 0-100
    category: 'BOTTOM_BOUNCE' | 'LOADING_ZONE' | 'SILENT_ACCUM';
    description: string;
}

export const WhaleScanner: React.FC<WhaleScannerProps> = ({ tickers, onTickerClick }) => {
    const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadVwapData = async () => {
            setIsLoading(true);
            const results: Record<string, VwapData> = {};
            const targetSymbols = tickers.slice(0, 100);

            const CHUNK_SIZE = 10;
            for (let i = 0; i < targetSymbols.length; i += CHUNK_SIZE) {
                const chunk = targetSymbols.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (t) => {
                    const data = await fetchWeeklyVwapData(t.symbol);
                    if (data) results[t.id] = data;
                }));
            }
            setVwapStore(results);
            setIsLoading(false);
        };
        loadVwapData();
    }, [tickers.length > 0]);

    const results = useMemo(() => {
        return tickers.map(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return null;

            const price = t.priceUsd;
            let result: AccumulationResult | null = null;

            // 1. BOTTOM BOUNCE: Just above Min, positive momentum
            if (price > vwap.min && price < (vwap.min * 1.05) && t.priceChangePercent24h > 0) {
                result = {
                    ticker: t,
                    vwap,
                    intensity: 90 + Math.min(10, t.priceChangePercent24h),
                    category: 'BOTTOM_BOUNCE',
                    description: "Initial ignition from Weekly Floor. High reversal potential."
                };
            }
            // 2. LOADING ZONE: Price holding between Min and Mid with Volume > 0
            else if (price > vwap.min && price < vwap.mid) {
                const volStrength = Math.min(20, t.volume24h / 10000000); // normalized volume factor
                result = {
                    ticker: t,
                    vwap,
                    intensity: 70 + volStrength,
                    category: 'LOADING_ZONE',
                    description: "Price in accumulation range. Smart money loading positions."
                };
            }
            // 3. SILENT ACCUM: Price very flat but volume stable
            else if (Math.abs(t.priceChangePercent24h) < 1 && t.volume24h > 5000000 && price < vwap.mid) {
                result = {
                    ticker: t,
                    vwap,
                    intensity: 60,
                    category: 'SILENT_ACCUM',
                    description: "Low volatility consolidation with stable liquidity flow."
                };
            }

            return result;
        })
            .filter((r): r is AccumulationResult => r !== null)
            .sort((a, b) => b.intensity - a.intensity);
    }, [tickers, vwapStore]);

    if (isLoading && Object.keys(vwapStore).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
                <Waves className="w-12 h-12 text-blue-500 animate-bounce" />
                <p className="text-sm font-black tracking-widest uppercase text-blue-400">Scanning Deep Waters for Whale Activity...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-blue-500/10 shadow-2xl overflow-hidden">
            {/* Whale Header */}
            <div className="p-6 border-b border-blue-500/20 bg-gradient-to-b from-blue-900/10 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                        <Anchor className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">Whale Accumulation</h2>
                        <p className="text-xs text-blue-400/60 font-medium font-mono uppercase">Detecting early reversals & bottom-loading</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 px-4 py-2 bg-blue-900/20 rounded-xl border border-blue-500/20">
                    <Fish className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-black text-blue-400">{results.length} OPPORTUNITIES</span>
                </div>
            </div>

            {/* Grid List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {results.map((res) => (
                        <button
                            key={res.ticker.id}
                            onClick={() => onTickerClick(res.ticker)}
                            className="group flex flex-col p-5 bg-[#12141c] border border-gray-800 rounded-2xl hover:border-blue-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] active:scale-[0.98]"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-black text-white group-hover:text-blue-400">
                                        {res.ticker.symbol}
                                    </span>
                                    {res.category === 'BOTTOM_BOUNCE' && (
                                        <div className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-[8px] font-black border border-green-500/30 animate-pulse">
                                            IGNITION
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-mono font-bold text-white">${formatPrice(res.ticker.priceUsd)}</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Intensity Gauge */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Accumulation Strength</span>
                                        <span className="text-[10px] font-black text-blue-400">{res.intensity.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000"
                                            style={{ width: `${res.intensity}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Activity className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase">{res.category.replace('_', ' ')}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                                        {res.description}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between text-[10px]">
                                    <div className="flex flex-col">
                                        <span className="text-gray-600 font-bold uppercase mb-0.5">Vol-24H</span>
                                        <span className="text-white font-mono">${(res.ticker.volume24h / 1000000).toFixed(1)}M</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-gray-600 font-bold uppercase mb-0.5">Dist to Min</span>
                                        <span className="text-green-400 font-mono font-black">+{(((res.ticker.priceUsd - res.vwap.min) / res.vwap.min) * 100).toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {results.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                        <Info className="w-12 h-12 opacity-10 mb-4" />
                        <p>Waiting for deep sea accumulation signals...</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-blue-500/5 border-t border-blue-500/10 flex items-center gap-3">
                <Info className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                    Targets tokens at major weekly support before the breakout phase.
                </span>
            </div>
        </div>
    );
};
