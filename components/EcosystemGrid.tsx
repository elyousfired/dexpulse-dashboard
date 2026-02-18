
import React, { useMemo, useState } from 'react';
import { CexTicker, VwapData } from '../types';
import { getEcosystemsWithTickers } from '../services/ecosystemService';
import {
    Layers, TrendingUp, ArrowUpRight, ArrowDownRight, Zap, Trophy,
    BarChart3, Users, Flame, Filter, Star, Gauge, Activity
} from 'lucide-react';

interface EcosystemGridProps {
    tickers: CexTicker[];
    vwapStore: Record<string, VwapData>;
    onTickerClick: (ticker: CexTicker) => void;
}

export const EcosystemGrid: React.FC<EcosystemGridProps> = ({ tickers, vwapStore, onTickerClick }) => {
    const [heatPulseEnabled, setHeatPulseEnabled] = useState(false);
    const [filterAboveVwap, setFilterAboveVwap] = useState(false);

    const ecosystems = useMemo(() => {
        let list = getEcosystemsWithTickers(tickers, vwapStore);
        if (filterAboveVwap) {
            list = list.filter(eco => eco.powerScore > 50);
        }
        return list;
    }, [tickers, vwapStore, filterAboveVwap]);

    const formatFlow = (val: number) => {
        const abs = Math.abs(val);
        if (abs >= 1000000) return `${val < 0 ? '-' : '+'}${(abs / 1000000).toFixed(1)}M$`;
        if (abs >= 1000) return `${val < 0 ? '-' : '+'}${(abs / 1000).toFixed(1)}K$`;
        return `${val < 0 ? '-' : '+'}${abs.toFixed(0)}$`;
    };

    return (
        <div className="flex flex-col gap-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative p-8 rounded-3xl bg-[#0d1117] border border-white/10 backdrop-blur-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12">
                    <Activity className="w-64 h-64 text-blue-500" />
                </div>

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <div className="absolute inset-0 bg-blue-500/20 blur-2xl animate-pulse rounded-full" />
                            <div className="p-5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl border border-white/20 shadow-2xl relative">
                                <Gauge className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Rotation Radar</h2>
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded text-[10px] font-black uppercase tracking-widest">Live v3.0</span>
                            </div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                                <Activity className="w-3 h-3" /> Detect Capital Flow • Power Index • Breakout Star
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            onClick={() => setHeatPulseEnabled(!heatPulseEnabled)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all font-black text-[11px] uppercase tracking-wider ${heatPulseEnabled
                                    ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)]'
                                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white'
                                }`}
                        >
                            <Flame className={`w-4 h-4 ${heatPulseEnabled ? 'animate-bounce' : ''}`} />
                            Heat Pulse Mode
                        </button>

                        <button
                            onClick={() => setFilterAboveVwap(!filterAboveVwap)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all font-black text-[11px] uppercase tracking-wider ${filterAboveVwap
                                    ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white'
                                }`}
                        >
                            <Filter className="w-4 h-4" />
                            Power Index {'>'} 50
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {ecosystems.map((eco, idx) => {
                    const isPositive = eco.powerScore >= 50;
                    const btcRelative = (eco.tokens.reduce((acc, t) => acc + t.priceChangePercent24h, 0) / eco.tokens.length).toFixed(1);

                    return (
                        <div
                            key={eco.name}
                            style={{ animationDelay: `${idx * 100}ms` }}
                            className="group relative flex flex-col bg-[#0b0e14] rounded-[2.5rem] border border-white/5 p-1 transition-all duration-500 hover:border-blue-500/30 animate-in fade-in zoom-in-95"
                        >
                            {heatPulseEnabled && isPositive && (
                                <div className="absolute inset-0 bg-orange-500/5 animate-pulse rounded-[2.5rem] -z-10 blur-xl" />
                            )}

                            <div className="flex-1 bg-gradient-to-br from-white/[0.03] to-transparent rounded-[2.4rem] p-7 overflow-hidden relative">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${eco.gradient} flex items-center justify-center font-black text-lg ${eco.color} border border-white/10`}>
                                            {eco.symbol[0]}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white tracking-tight uppercase group-hover:text-blue-400 transition-colors">{eco.name}</h3>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${isPositive ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-rose-500'}`} />
                                                    <span className="text-[10px] font-black text-gray-500 uppercase">{eco.tokens.length} Assets</span>
                                                </div>
                                                <span className="text-[10px] font-black text-blue-500/60 uppercase">vs BTC: {btcRelative}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border-2 ${eco.powerScore > 80 ? 'border-orange-500 bg-orange-500/10' :
                                            eco.powerScore > 50 ? 'border-blue-500 bg-blue-500/10' :
                                                'border-gray-800 bg-gray-900'
                                        } shadow-xl relative`}>
                                        <span className={`text-lg font-black ${eco.powerScore > 80 ? 'text-orange-400' :
                                                eco.powerScore > 50 ? 'text-blue-400' : 'text-gray-500'
                                            }`}>{eco.powerScore}</span>
                                        <span className="text-[7px] font-black text-gray-500 absolute bottom-1 uppercase">Power</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div className="bg-black/40 rounded-2xl border border-white/5 p-4 py-3">
                                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Capital Flow</p>
                                        <p className={`text-xs font-black ${eco.capitalFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {formatFlow(eco.capitalFlow)}
                                        </p>
                                    </div>
                                    <div className="bg-black/40 rounded-2xl border border-white/5 p-4 py-3">
                                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Momentum</p>
                                        <p className={`text-xs font-black uppercase tracking-tighter ${eco.momentum === 'Bullish' ? 'text-orange-400' :
                                                eco.momentum === 'Bearish' ? 'text-rose-500' : 'text-blue-400'
                                            }`}>
                                            {eco.momentum}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 mb-8">
                                    <div className="flex items-center justify-between p-3 px-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                                        <div className="flex items-center gap-3">
                                            <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-tighter">Leader — <b className="text-white">{eco.leader?.symbol}</b></span>
                                        </div>
                                        <span className="text-[10px] font-black text-emerald-400">+{eco.leader?.priceChangePercent24h.toFixed(1)}%</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 px-4 bg-rose-500/5 rounded-xl border border-rose-500/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">🥶</div>
                                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-tighter">Lagger — <b className="text-white">{eco.lagger?.symbol}</b></span>
                                        </div>
                                        <span className="text-[10px] font-black text-rose-500">{eco.lagger?.priceChangePercent24h.toFixed(1)}%</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2.5">
                                    {eco.tokens.map((t) => {
                                        const vwap = vwapStore[t.id];
                                        const isBreakoutCandidate = vwap && t.priceUsd > vwap.max && vwap.normalizedSlope > 0.05;
                                        const isHeated = heatPulseEnabled && t.priceChangePercent24h > 5;

                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => onTickerClick(t)}
                                                className={`group/chip relative flex items-center gap-2 px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.08] rounded-xl border transition-all duration-300 ${isHeated ? 'border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)] animate-pulse' :
                                                        isBreakoutCandidate ? 'border-blue-500/40 hover:-translate-y-1' : 'border-white/[0.05]'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    {isBreakoutCandidate && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                                                    <span className="text-xs font-black text-gray-300 group-hover/chip:text-white transition-colors">{t.symbol}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold transition-all px-1.5 py-0.5 rounded-md ${t.priceChangePercent24h >= 0 ? 'text-emerald-500 bg-emerald-500/5' : 'text-rose-500 bg-rose-500/5'}`}>
                                                    {t.priceChangePercent24h >= 0 ? '+' : ''}{t.priceChangePercent24h.toFixed(1)}%
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className={`absolute -bottom-10 -right-10 w-32 h-32 bg-gradient-to-br ${eco.gradient} blur-[70px] opacity-10`} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {ecosystems.length === 0 && (
                <div className="flex flex-col items-center justify-center p-32 text-gray-500">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500/20 blur-[100px] animate-pulse rounded-full" />
                        <Zap className="w-20 h-20 text-blue-500 animate-bounce relative z-10" />
                    </div>
                    <p className="mt-8 uppercase font-black text-sm tracking-[0.5em] text-white/50 animate-pulse">Initializing Ecosystem Neural Link...</p>
                </div>
            )}
        </div>
    );
};
