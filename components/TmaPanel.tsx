
import React from 'react';
import { TmaState } from '../services/tmaService';
import { formatPrice } from '../services/cexService';
import {
    LayoutTemplate, Target, TrendingUp, TrendingDown,
    Zap, Info, Activity, Shield, AlertCircle,
    ArrowUpRight, ArrowDownRight, Compass
} from 'lucide-react';

interface TmaPanelProps {
    symbol: string;
    state: TmaState | null;
    isLoading: boolean;
}

export const TmaPanel: React.FC<TmaPanelProps> = ({ symbol, state, isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-[#0d0f14] rounded-3xl border border-white/5 animate-pulse">
                <Compass className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 text-center">
                    Architecting Market Structure...
                </p>
            </div>
        );
    }

    if (!state) {
        return (
            <div className="p-8 bg-rose-500/5 rounded-3xl border border-rose-500/20 text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
                <p className="text-xs font-bold text-rose-400 uppercase">Insufficient Architecture Data</p>
            </div>
        );
    }

    const { metrics, classification, current, probabilities } = state;
    const activeBias = probabilities.reversal > probabilities.continuation
        ? (current.mss === 'Long' ? 'Reversal Long' : 'Reversal Short')
        : (current.acceptance ? 'Trend Continuation' : 'Range Bound');

    const confidence = Math.max(probabilities.reversal, probabilities.continuation, probabilities.range);

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Header: Core Bias */}
            <div className={`p-6 rounded-3xl border ${confidence > 60 ? 'border-orange-500/30 bg-orange-500/5 shadow-[0_0_30px_rgba(249,115,22,0.1)]' :
                'border-blue-500/20 bg-blue-500/5'
                }`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-black/40 rounded-xl border border-white/10">
                            <Activity className={`w-5 h-5 ${confidence > 60 ? 'text-orange-400' : 'text-blue-400'}`} />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Architecture Bias</h3>
                            <div className="text-lg font-black text-white uppercase tracking-tighter italic">{activeBias}</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black text-gray-500 uppercase mb-1">Confidence</div>
                        <div className={`text-xl font-black ${confidence > 60 ? 'text-orange-400' : 'text-blue-400'}`}>{confidence}%</div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1">Reversal</span>
                        <span className="text-xs font-black text-white">{probabilities.reversal}%</span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1">Cont.</span>
                        <span className="text-xs font-black text-white">{probabilities.continuation}%</span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1">Range</span>
                        <span className="text-xs font-black text-white">{probabilities.range}%</span>
                    </div>
                </div>
            </div>

            {/* Previous Day Architecture */}
            <div className="p-6 bg-[#0d0f14] rounded-3xl border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                    <LayoutTemplate className="w-5 h-5 text-gray-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Yesterday Architecture</h3>
                    <div className={`ml-auto px-2 py-0.5 rounded text-[9px] font-black uppercase ${classification === 'Bullish' ? 'bg-emerald-500/20 text-emerald-400' :
                        classification === 'Bearish' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-blue-500/20 text-blue-400'
                        }`}>
                        {classification} Day
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-black/40 rounded-2xl border border-white/5">
                            <span className="text-[9px] font-black text-gray-600 uppercase block mb-1">PDH (High)</span>
                            <span className="text-sm font-mono font-bold text-white">${formatPrice(metrics.pdh)}</span>
                        </div>
                        <div className="p-3 bg-black/40 rounded-2xl border border-white/5 text-right">
                            <span className="text-[9px] font-black text-gray-600 uppercase block mb-1">PDL (Low)</span>
                            <span className="text-sm font-mono font-bold text-white">${formatPrice(metrics.pdl)}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col px-3 py-2 bg-black/20 rounded-xl border border-white/5">
                            <span className="text-[8px] font-black text-gray-600 uppercase">PDO</span>
                            <span className="text-[10px] font-mono text-gray-400">${formatPrice(metrics.pdo)}</span>
                        </div>
                        <div className="flex flex-col px-3 py-2 bg-black/20 rounded-xl border border-white/5 text-center">
                            <span className="text-[8px] font-black text-gray-600 uppercase">MID</span>
                            <span className="text-[10px] font-mono text-gray-400">${formatPrice(metrics.mid)}</span>
                        </div>
                        <div className="flex flex-col px-3 py-2 bg-black/20 rounded-xl border border-white/5 text-right">
                            <span className="text-[8px] font-black text-gray-600 uppercase">PDC</span>
                            <span className="text-[10px] font-mono text-gray-400">${formatPrice(metrics.pdc)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Current Day Detection */}
            <div className="p-6 bg-[#0d0f14] rounded-3xl border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                    <Target className="w-5 h-5 text-gray-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Intraday Engine</h3>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-black text-gray-500 uppercase italic">Sweep State:</span>
                        <span className={`text-[10px] font-black uppercase ${current.last15mSweep ? 'text-orange-400 animate-pulse' : 'text-gray-600'}`}>
                            {current.last15mSweep || 'Null Sweep'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-black text-gray-500 uppercase italic">Acceptance:</span>
                        <span className={`text-[10px] font-black uppercase ${current.acceptance ? 'text-blue-400' : 'text-gray-600'}`}>
                            {current.acceptance || 'Inside Range'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-black text-gray-500 uppercase italic">M structure Shift:</span>
                        {current.mss ? (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${current.mss === 'Long' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                }`}>
                                {current.mss === 'Long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                <span className="text-[10px] font-black uppercase">{current.mss} Detected</span>
                            </div>
                        ) : (
                            <span className="text-[10px] font-black text-gray-600 uppercase">Scanning...</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Scenario Engine Board */}
            <div className="p-6 bg-gradient-to-br from-indigo-900/20 to-transparent rounded-[2.5rem] border border-indigo-500/30 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
                    <Zap className="w-32 h-32 text-indigo-500" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                            <Zap className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Scenario Engine</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-xl">
                            <div className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Scenario Trigger</div>
                            <p className="text-xs text-gray-300 font-bold leading-relaxed">
                                {current.mss ? `${current.mss} Structure Shift detected. High probability of directional expansion.` :
                                    current.last15mSweep ? `Sweep of ${current.last15mSweep} detected. Monitoring for MSS to confirm Reversal.` :
                                        "Monitoring range extremes (PDH/PDL) for first sweep or acceptance signature."}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex flex-col gap-2">
                                <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1">Tactical Targets</div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-blue-500/30 transition-all">
                                        <div className="flex items-center gap-3">
                                            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-black text-blue-400">1</span>
                                            <span className="text-[10px] font-black text-gray-400 uppercase">Architectural MID</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-white">${formatPrice(metrics.mid)}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-emerald-500/30 transition-all">
                                        <div className="flex items-center gap-3">
                                            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-black text-emerald-400">2</span>
                                            <span className="text-[10px] font-black text-gray-400 uppercase">PD Value Area (O/C)</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-white">${formatPrice(metrics.pdc)}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:border-orange-500/30 transition-all">
                                        <div className="flex items-center gap-3">
                                            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-orange-500/20 text-[10px] font-black text-orange-400">3</span>
                                            <span className="text-[10px] font-black text-gray-400 uppercase">PD Liquidity Hub (H/L)</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-white">${formatPrice(metrics.pdh)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className="flex items-center gap-2 p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                                <Shield className="w-4 h-4 text-rose-500" />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Invalidation Zone</span>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase truncate">15m close below PDL / Current Low</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
