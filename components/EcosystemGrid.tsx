
import React, { useMemo } from 'react';
import { CexTicker } from '../types';
import { getEcosystemsWithTickers, EcosystemGroup } from '../services/ecosystemService';
import { Layers, TrendingUp, ArrowUpRight, ArrowDownRight, Zap, Trophy, BarChart3, Users } from 'lucide-react';

interface EcosystemGridProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

export const EcosystemGrid: React.FC<EcosystemGridProps> = ({ tickers, onTickerClick }) => {
    const ecosystems = useMemo(() => getEcosystemsWithTickers(tickers), [tickers]);

    const getSectorStats = (tokens: CexTicker[]) => {
        if (tokens.length === 0) return { avg: 0, leader: null, totalVol: 0 };

        const avg = tokens.reduce((acc, t) => acc + t.priceChangePercent24h, 0) / tokens.length;
        const leader = [...tokens].sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h)[0];
        const totalVol = tokens.reduce((acc, t) => acc + t.volume24h, 0);

        return { avg, leader, totalVol };
    };

    return (
        <div className="flex flex-col gap-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header section with glassmorphism */}
            <div className="relative p-8 rounded-3xl bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-transparent border border-white/10 backdrop-blur-md overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
                    <Layers className="w-48 h-48 text-blue-400" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-blue-500/20 rounded-2xl border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                            <Layers className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Sector Rotation Hub</h2>
                            <p className="text-xs text-blue-400/60 font-black uppercase tracking-[0.2em] mt-1">Institutional Grade Ecosystem Analytics v2.0</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="px-5 py-3 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                            <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Total Assets</p>
                            <p className="text-xl font-black text-white">{tickers.length}</p>
                        </div>
                        <div className="px-5 py-3 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                            <p className="text-[10px] font-black text-gray-500 uppercase mb-1">Active Sectors</p>
                            <p className="text-xl font-black text-blue-400">{ecosystems.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {ecosystems.map((eco, idx) => {
                    const stats = getSectorStats(eco.tokens);
                    const isPositive = stats.avg >= 0;

                    return (
                        <div
                            key={eco.name}
                            style={{ animationDelay: `${idx * 100}ms` }}
                            className="group relative flex flex-col bg-[#0b0e14] rounded-[2.5rem] border border-white/5 p-1 transition-all duration-500 hover:border-blue-500/30 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95"
                        >
                            {/* Inner Glass Container */}
                            <div className="flex-1 bg-gradient-to-br from-white/[0.03] to-transparent rounded-[2.4rem] p-7 overflow-hidden relative">

                                {/* Top Gradient Glow */}
                                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r ${eco.gradient} opacity-0 group-hover:opacity-100 transition-all duration-700 blur-md`} />

                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${eco.gradient} flex items-center justify-center font-black text-lg ${eco.color} border border-white/10 shadow-lg`}>
                                            {eco.symbol[0]}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white tracking-tight uppercase group-hover:text-blue-400 transition-colors">{eco.name}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Users className="w-3 h-3 text-gray-600" />
                                                <span className="text-[10px] font-bold text-gray-500 uppercase">{eco.tokens.length} Assets</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`flex flex-col items-end px-3 py-1.5 rounded-2xl border ${isPositive ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                        <div className={`flex items-center gap-1 text-xs font-black ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                            {stats.avg.toFixed(2)}%
                                        </div>
                                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">Avg 24H</span>
                                    </div>
                                </div>

                                {/* Sector Leaderboard Brief */}
                                {stats.leader && (
                                    <div className="mb-8 p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-between group/leader hover:border-blue-500/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-yellow-500/10 rounded-lg">
                                                <Trophy className="w-4 h-4 text-yellow-500" />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-gray-600 uppercase">Top Gainer</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-black text-white">{stats.leader.symbol}</span>
                                                    <BarChart3 className="w-3 h-3 text-blue-500" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-emerald-400">+{stats.leader.priceChangePercent24h.toFixed(1)}%</p>
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2.5">
                                    {eco.tokens.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => onTickerClick(t)}
                                            className="group/chip relative flex items-center gap-2.5 px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.08] rounded-xl border border-white/[0.05] hover:border-blue-500/40 transition-all duration-300 hover:-translate-y-0.5"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-blue-500/40 group-hover/chip:bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                            <span className="text-xs font-black text-gray-300 group-hover/chip:text-white transition-colors">{t.symbol}</span>
                                            <span className={`text-[10px] font-bold transition-all px-1.5 py-0.5 rounded-md ${t.priceChangePercent24h >= 0 ? 'text-emerald-500 bg-emerald-500/5' : 'text-rose-500 bg-rose-500/5'}`}>
                                                {t.priceChangePercent24h >= 0 ? '+' : ''}{t.priceChangePercent24h.toFixed(1)}%
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* Background Accent */}
                                <div className={`absolute -bottom-10 -right-10 w-32 h-32 bg-gradient-to-br ${eco.gradient} blur-[60px] opacity-20`} />
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
