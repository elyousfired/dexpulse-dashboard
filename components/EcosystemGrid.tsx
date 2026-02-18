
import React, { useMemo } from 'react';
import { CexTicker } from '../types';
import { getEcosystemsWithTickers, EcosystemGroup } from '../services/ecosystemService';
import { Layers, TrendingUp, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';

interface EcosystemGridProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

export const EcosystemGrid: React.FC<EcosystemGridProps> = ({ tickers, onTickerClick }) => {
    const ecosystems = useMemo(() => getEcosystemsWithTickers(tickers), [tickers]);

    const calculateEcosystemPerformance = (tokens: CexTicker[]) => {
        if (tokens.length === 0) return 0;
        const sum = tokens.reduce((acc, t) => acc + t.priceChangePercent24h, 0);
        return sum / tokens.length;
    };

    return (
        <div className="flex flex-col gap-8 pb-20">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                        <Layers className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Ecosystem Sectors</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Tracking Rotation across L1 Environments</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ecosystems.map((eco) => {
                    const avgPerf = calculateEcosystemPerformance(eco.tokens);
                    return (
                        <div key={eco.name} className="flex flex-col bg-[#12141c] rounded-2xl border border-gray-800 p-6 hover:border-blue-500/30 transition-all group shadow-xl">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center font-black text-xs ${eco.color} border border-white/5`}>
                                        {eco.symbol}
                                    </div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-tight">{eco.name}</h3>
                                </div>
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black ${avgPerf >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                    {avgPerf >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {avgPerf.toFixed(2)}%
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {eco.tokens.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => onTickerClick(t)}
                                        className="flex items-center gap-2 px-3 py-2 bg-black/40 rounded-xl border border-white/5 hover:border-blue-500/50 hover:bg-black/60 transition-all active:scale-95"
                                    >
                                        <span className="text-xs font-black text-white">{t.symbol}</span>
                                        <span className={`text-[9px] font-bold ${t.priceChangePercent24h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {t.priceChangePercent24h >= 0 ? '+' : ''}{t.priceChangePercent24h.toFixed(1)}%
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {ecosystems.length === 0 && (
                <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                    <Zap className="w-12 h-12 opacity-10 mb-4 text-blue-500" />
                    <p className="uppercase font-black text-xs tracking-widest animate-pulse">Scanning Ecosystems...</p>
                </div>
            )}
        </div>
    );
};
