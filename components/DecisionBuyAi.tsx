
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker } from '../types';
import { fetchWeeklyVwapData, VwapData, formatPrice } from '../services/cexService';
import { Brain, Star, TrendingUp, Info, ArrowRight, Zap, Trophy, ShieldCheck } from 'lucide-react';

interface DecisionBuyAiProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

interface BuySignal {
    ticker: CexTicker;
    vwap: VwapData;
    score: number;
    reason: string;
    type: 'GOLDEN' | 'MOMENTUM' | 'SUPPORT';
}

export const DecisionBuyAi: React.FC<DecisionBuyAiProps> = ({ tickers, onTickerClick, onAddToWatchlist }) => {
    const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadVwapData = async () => {
            setIsLoading(true);
            const results: Record<string, VwapData> = {};
            // Scan top 100 for signals
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

    const signals = useMemo(() => {
        return tickers.map(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return null;

            const price = t.priceUsd;
            let signal: BuySignal | null = null;

            // 1. GOLDEN BREAKOUT: Price > Max && Price > Mid && High Gain
            if (price > vwap.max && t.priceChangePercent24h > 5) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 95 + Math.min(5, t.priceChangePercent24h / 10),
                    reason: "Strong Breakout above Weekly Max with high momentum.",
                    type: 'GOLDEN'
                };
            }
            // 2. MOMENTUM PUSH: Price > Mid && Price < Max && Price rising
            else if (price > vwap.mid && price < vwap.max && t.priceChangePercent24h > 2) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 85 + Math.min(10, t.priceChangePercent24h / 5),
                    reason: "Entering momentum zone. High potential for Max retest.",
                    type: 'MOMENTUM'
                };
            }
            // 3. SUPPORT BOUNCE: Price approx Mid && Pos change
            else if (Math.abs(price - vwap.mid) / vwap.mid < 0.02 && t.priceChangePercent24h > 0) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 80,
                    reason: "Bouncing off Weekly Mid support. Safe entry point.",
                    type: 'SUPPORT'
                };
            }

            return signal;
        })
            .filter((s): s is BuySignal => s !== null)
            .sort((a, b) => b.score - a.score);
    }, [tickers, vwapStore]);

    if (isLoading && Object.keys(vwapStore).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
                <Brain className="w-12 h-12 text-purple-500 animate-pulse" />
                <p className="text-sm font-black tracking-widest uppercase">AI Engine Analyzing Buy Signals...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-purple-500/20 shadow-[0_0_50px_rgba(168,85,247,0.05)] overflow-hidden">
            {/* AI Header */}
            <div className="p-6 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-2xl border border-purple-500/30">
                        <Brain className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">Decision Buy AI</h2>
                        <p className="text-xs text-purple-400/60 font-medium font-mono lowercase">Predictive breakout & support engine v1.0</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-600 uppercase">Signals Found</span>
                        <span className="text-xl font-black text-purple-400">{signals.length}</span>
                    </div>
                </div>
            </div>

            {/* Signal List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {signals.map((sig) => (
                        <button
                            key={sig.ticker.id}
                            onClick={() => onTickerClick(sig.ticker)}
                            className="group relative flex flex-col p-5 bg-[#12141c] rounded-2xl border border-gray-800 hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)] active:scale-[0.99]"
                        >
                            {/* Score Badge */}
                            <div className="absolute top-4 right-4 flex flex-col items-end">
                                <div className="text-[10px] font-black text-gray-500 uppercase mb-1">Buy Score</div>
                                <div className="flex items-center gap-2">
                                    <Trophy className={`w-4 h-4 ${sig.score > 90 ? 'text-yellow-500' : 'text-purple-400'}`} />
                                    <span className="text-2xl font-black text-white italic">{sig.score.toFixed(0)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${sig.type === 'GOLDEN' ? 'bg-yellow-500 text-black' :
                                    sig.type === 'MOMENTUM' ? 'bg-purple-600 text-white' :
                                        'bg-blue-600 text-white'
                                    }`}>
                                    {sig.ticker.symbol[0]}
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white group-hover:text-purple-400 transition-colors uppercase tracking-tighter">
                                        {sig.ticker.symbol} / USDT
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${sig.type === 'GOLDEN' ? 'bg-yellow-500/20 text-yellow-500' :
                                            sig.type === 'MOMENTUM' ? 'bg-purple-500/20 text-purple-400' :
                                                'bg-blue-500/20 text-blue-400'
                                            }`}>
                                            {sig.type} SIGNAL
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/40 rounded-xl p-4 border border-white/5 mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">AI Verdict</span>
                                </div>
                                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                                    {sig.reason}
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Price</span>
                                    <span className="text-sm font-mono font-bold text-white">${formatPrice(sig.ticker.priceUsd)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Target (Max)</span>
                                    <span className="text-sm font-mono font-bold text-green-400">${formatPrice(sig.vwap.max)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Stop (Mid)</span>
                                    <span className="text-sm font-mono font-bold text-rose-400">${formatPrice(sig.vwap.mid)}</span>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddToWatchlist(sig.ticker);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 text-blue-400 border border-blue-600/20 rounded-xl text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all"
                                >
                                    <Star className="w-3 h-3" />
                                    ADD TO WATCHLIST
                                </button>
                                <div className="flex items-center gap-1 text-purple-400 font-black text-xs group-hover:gap-2 transition-all uppercase">
                                    Investigate <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {signals.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                        <Zap className="w-12 h-12 opacity-10 mb-4" />
                        <p>Scanning markets for low-risk buying opportunities...</p>
                    </div>
                )}
            </div>

            {/* Footer Notice */}
            <div className="p-4 bg-purple-900/5 border-t border-purple-500/10 flex items-center gap-3">
                <Info className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    AI Signals are for educational purposes. Always verify Liquidity Flow & CVD before entering a trade.
                </span>
            </div>
        </div>
    );
};
