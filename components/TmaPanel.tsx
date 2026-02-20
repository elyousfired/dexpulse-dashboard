
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

    const { metrics, classification, current, probabilities, liquidityTaken } = state;
    const confidence = Math.max(probabilities.reversal, probabilities.continuation, probabilities.range);

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-8">
            {/* 1. Live State & Probability Engine */}
            <div className={`p-6 rounded-[2.5rem] border ${confidence > 60 ? 'border-orange-500/30 bg-orange-500/5 shadow-[0_0_30px_rgba(249,115,22,0.1)]' :
                'border-blue-500/20 bg-blue-500/5'
                }`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border ${current.state === 'ACCEPT ABOVE' || current.state === 'ACCEPT BELOW' ? 'bg-red-500/20 border-red-500/40 text-red-400' :
                            current.state === 'SWEEPING LIQUIDITY' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' :
                                'bg-blue-500/20 border-blue-500/40 text-blue-400'
                            }`}>
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">DECISION ENGINE STATE</h3>
                            <div className="text-sm font-black text-white uppercase tracking-wider italic flex items-center gap-2">
                                <span className={current.state.includes('ACCEPT') ? 'text-red-400' : current.state.includes('SWEEP') ? 'text-amber-400' : 'text-blue-400'}>
                                    {current.state}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black text-gray-500 uppercase mb-1">Algorithm Confidence</div>
                        <div className={`text-xl font-black ${confidence > 60 ? 'text-orange-400' : 'text-blue-400'}`}>{confidence}%</div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1.5">REVERSAL</span>
                        <span className={`text-sm font-black ${probabilities.reversal > 40 ? 'text-orange-400' : 'text-white'}`}>{probabilities.reversal}%</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1.5">CONT.</span>
                        <span className={`text-sm font-black ${probabilities.continuation > 40 ? 'text-blue-400' : 'text-white'}`}>{probabilities.continuation}%</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1.5">RANGE</span>
                        <span className={`text-sm font-black ${probabilities.range > 40 ? 'text-emerald-400' : 'text-white'}`}>{probabilities.range}%</span>
                    </div>
                </div>
            </div>

            {/* 2. Distance Meter (Institutional Spec) */}
            <div className="p-6 bg-[#0d0f14] rounded-3xl border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                    <Compass className="w-5 h-5 text-gray-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Target Distance Meter</h3>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 pb-2">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter">
                                <span className="text-gray-500">PDH (PRICE)</span>
                                <span className={current.distances.pdh > 0 ? 'text-white' : 'text-emerald-400'}>{current.distances.pdh.toFixed(2)}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500/50" style={{ width: `${Math.min(100, Math.max(0, 100 - current.distances.pdh * 20))}%` }} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter">
                                <span className="text-indigo-400">W-PDH (VWAP)</span>
                                <span className="text-indigo-300">{current.distances.vwap_pdh.toFixed(2)}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500/50" style={{ width: `${Math.min(100, Math.max(0, 100 - current.distances.vwap_pdh * 20))}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter">
                                <span className="text-gray-500">PDL (PRICE)</span>
                                <span className={current.distances.pdl > 0 ? 'text-white' : 'text-rose-400'}>{current.distances.pdl.toFixed(2)}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500/50" style={{ width: `${Math.min(100, Math.max(0, 100 - current.distances.pdl * 20))}%` }} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter">
                                <span className="text-indigo-400">W-PDL (VWAP)</span>
                                <span className="text-indigo-300">{current.distances.vwap_pdl.toFixed(2)}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500/50" style={{ width: `${Math.min(100, Math.max(0, 100 - current.distances.vwap_pdl * 20))}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter mb-1.5">
                            <span className="text-gray-500">Distance to PD-MID (Rebalance)</span>
                            <span className="text-blue-400">{current.distances.mid.toFixed(2)}%</span>
                        </div>
                        <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-blue-500/50" style={{ width: `${Math.min(100, 100 - current.distances.mid * 50)}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Session Liquidity Tracker */}
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className={`p-4 rounded-3xl border ${liquidityTaken.buySide ? 'bg-red-500/10 border-red-500/20' : 'bg-black/20 border-white/5'}`}>
                        <div className="text-[8px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Price Buy Liq.</div>
                        <div className="flex items-center gap-2">
                            {liquidityTaken.buySide ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Shield className="w-4 h-4 text-gray-600" />}
                            <span className={`text-[10px] font-black uppercase ${liquidityTaken.buySide ? 'text-red-400' : 'text-gray-600'}`}>
                                {liquidityTaken.buySide ? 'SWEPT' : 'UNTYPED'}
                            </span>
                        </div>
                    </div>
                    <div className={`p-4 rounded-3xl border ${liquidityTaken.vwapBuySide ? 'bg-orange-500/10 border-orange-500/20' : 'bg-black/20 border-white/5'}`}>
                        <div className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">VWAP Buy Liq.</div>
                        <div className="flex items-center gap-2">
                            {liquidityTaken.vwapBuySide ? <Target className="w-4 h-4 text-orange-500" /> : <Shield className="w-4 h-4 text-gray-600" />}
                            <span className={`text-[10px] font-black uppercase ${liquidityTaken.vwapBuySide ? 'text-orange-400' : 'text-gray-600'}`}>
                                {liquidityTaken.vwapBuySide ? 'REJECTED' : 'SAFE'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className={`p-4 rounded-3xl border ${liquidityTaken.sellSide ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-black/20 border-white/5'}`}>
                        <div className="text-[8px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Price Sell Liq.</div>
                        <div className="flex items-center gap-2">
                            {liquidityTaken.sellSide ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <Shield className="w-4 h-4 text-gray-600" />}
                            <span className={`text-[10px] font-black uppercase ${liquidityTaken.sellSide ? 'text-emerald-400' : 'text-gray-600'}`}>
                                {liquidityTaken.sellSide ? 'SWEPT' : 'UNTYPED'}
                            </span>
                        </div>
                    </div>
                    <div className={`p-4 rounded-3xl border ${liquidityTaken.vwapSellSide ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-black/20 border-white/5'}`}>
                        <div className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">VWAP Sell Liq.</div>
                        <div className="flex items-center gap-2">
                            {liquidityTaken.vwapSellSide ? <Target className="w-4 h-4 text-cyan-500" /> : <Shield className="w-4 h-4 text-gray-600" />}
                            <span className={`text-[10px] font-black uppercase ${liquidityTaken.vwapSellSide ? 'text-cyan-400' : 'text-gray-600'}`}>
                                {liquidityTaken.vwapSellSide ? 'REJECTED' : 'SAFE'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Scenario Playbook Box */}
            <div className="p-7 bg-gradient-to-br from-indigo-900/40 to-black/60 rounded-[3rem] border border-indigo-500/30 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12 scale-150">
                    <Zap className="w-40 h-40 text-indigo-500" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/40">
                            <Zap className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Playbook Execution</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="p-5 bg-black/60 rounded-2xl border border-white/5 backdrop-blur-3xl shadow-inner">
                            <div className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-3">SCENARIO TRIGGER</div>
                            <p className="text-[11px] text-gray-300 font-bold leading-relaxed italic">
                                {current.state === 'ACCEPT ABOVE' ? "Structure accepting above PDH liquidity. Focus on expansion targets with trend-following bias." :
                                    current.state === 'ACCEPT BELOW' ? "Structure accepting below PDL liquidity. Bearish expansion in progress." :
                                        current.state === 'VWAP REJECTION' ? `Architectural rejection at ${current.vwapSweep === 'Buy-Side' ? 'W-PDH(V)' : 'W-PDL(V)'}. Strong sign of absorption or lack of value participation.` :
                                            current.mss ? `Confirmed MSS ${current.mss} after sweep. Tactical reversal initiated.` :
                                                current.last15mSweep ? `Price liquidity hunt detected (${current.last15mSweep}). Monitor for MSS or VWAP rejection to confirm entry.` :
                                                    "Range-bound consolidation. Waiting for architectural expansion, sweep, or VWAP divergence signature."}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1">Tactical Targets (Scale Out)</div>
                            <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-crosshair">
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Architectural MID</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-white tracking-widest">${formatPrice(metrics.mid)}</span>
                                </div>
                                <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all cursor-crosshair">
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Opposite Peak</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-white tracking-widest">${formatPrice(current.bias.includes('Long') ? metrics.pdh : metrics.pdl)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${current.bias.includes('Neutral') ? 'bg-gray-800/20 border-gray-700/50' : 'bg-red-500/10 border-red-500/20'}`}>
                                <Shield className={`w-4 h-4 ${current.bias.includes('Neutral') ? 'text-gray-500' : 'text-red-500'}`} />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-rose-400 uppercase tracking-[0.2em] mb-0.5">Invalidation Hub</span>
                                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">
                                        {current.state.includes('ACCEPT') ? "M5 RE-ENTRY INTO PD RANGE" : "15M CLOSE BELOW PDL / SWEEP LOW"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
