
import React from 'react';
import { VwapArchState } from '../services/vwapArchService';
import { formatPrice } from '../services/cexService';
import {
    Activity, Shield, Zap, Compass,
    TrendingUp, TrendingDown, AlertCircle, Waves
} from 'lucide-react';

interface VwapArchPanelProps {
    symbol: string;
    state: VwapArchState | null;
    isLoading: boolean;
}

export const VwapArchPanel: React.FC<VwapArchPanelProps> = ({ symbol, state, isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-[#0d0f14] rounded-3xl border border-white/5 animate-pulse">
                <Waves className="w-10 h-10 text-cyan-500 animate-bounce mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 text-center">
                    Computing VWAP Architecture...
                </p>
            </div>
        );
    }

    if (!state) {
        return (
            <div className="p-8 bg-cyan-500/5 rounded-3xl border border-cyan-500/20 text-center">
                <AlertCircle className="w-8 h-8 text-cyan-500 mx-auto mb-3" />
                <p className="text-xs font-bold text-cyan-400 uppercase">Insufficient VWAP Data</p>
            </div>
        );
    }

    const { metrics, current, probabilities, liquidityTaken } = state;
    const confidence = Math.max(probabilities.reversal, probabilities.continuation, probabilities.range);

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500 pt-6 mt-6 border-t border-cyan-500/20">
            {/* Section Title */}
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/40">
                    <Waves className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">VWAP Architecture</h3>
                    <p className="text-[9px] text-cyan-400/60 font-bold uppercase tracking-wider">Weekly Structural Engine (from 1D VWAP)</p>
                </div>
            </div>

            {/* 1. Live State & Probability Engine */}
            <div className={`p-6 rounded-[2.5rem] border ${confidence > 60 ? 'border-cyan-500/30 bg-cyan-500/5 shadow-[0_0_30px_rgba(6,182,212,0.1)]' :
                'border-teal-500/20 bg-teal-500/5'
                }`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border ${current.state === 'ACCEPT ABOVE' || current.state === 'ACCEPT BELOW' ? 'bg-red-500/20 border-red-500/40 text-red-400' :
                            current.state.includes('SWEEPING') ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' :
                                'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                            }`}>
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">VWAP ENGINE STATE</h3>
                            <div className="text-sm font-black text-white uppercase tracking-wider italic flex items-center gap-2">
                                <span className={current.state.includes('ACCEPT') ? 'text-red-400' : current.state.includes('SWEEP') ? 'text-amber-400' : 'text-cyan-400'}>
                                    {current.state}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black text-gray-500 uppercase mb-1">Confidence</div>
                        <div className={`text-xl font-black ${confidence > 60 ? 'text-cyan-400' : 'text-teal-400'}`}>{confidence}%</div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1.5">REVERSAL</span>
                        <span className={`text-sm font-black ${probabilities.reversal > 40 ? 'text-orange-400' : 'text-white'}`}>{probabilities.reversal}%</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1.5">CONT.</span>
                        <span className={`text-sm font-black ${probabilities.continuation > 40 ? 'text-cyan-400' : 'text-white'}`}>{probabilities.continuation}%</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase mb-1.5">RANGE</span>
                        <span className={`text-sm font-black ${probabilities.range > 40 ? 'text-emerald-400' : 'text-white'}`}>{probabilities.range}%</span>
                    </div>
                </div>
            </div>

            {/* 2. Distance Meter */}
            <div className="p-6 bg-[#0d0f14] rounded-3xl border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                    <Compass className="w-5 h-5 text-gray-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">VWAP Distance Meter</h3>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                            <span className="text-gray-500">Distance to W-Max (Resistance)</span>
                            <span className={current.distances.wMax > 0 ? 'text-white' : 'text-emerald-400'}>{current.distances.wMax.toFixed(2)}%</span>
                        </div>
                        <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full transition-all duration-1000 ${current.distances.wMax < 0.5 ? 'bg-red-500' : 'bg-gray-700'}`}
                                style={{ width: `${Math.min(100, Math.max(0, 100 - current.distances.wMax * 20))}%` }}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                            <span className="text-gray-500">Distance to W-Min (Support)</span>
                            <span className={current.distances.wMin > 0 ? 'text-white' : 'text-rose-400'}>{current.distances.wMin.toFixed(2)}%</span>
                        </div>
                        <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full transition-all duration-1000 ${current.distances.wMin < 0.5 ? 'bg-emerald-500' : 'bg-gray-700'}`}
                                style={{ width: `${Math.min(100, Math.max(0, 100 - current.distances.wMin * 20))}%` }}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                            <span className="text-gray-500">Distance to W-Mid (Rebalance)</span>
                            <span className="text-cyan-400">{current.distances.wMid.toFixed(2)}%</span>
                        </div>
                        <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-cyan-500/50" style={{ width: `${Math.min(100, 100 - current.distances.wMid * 50)}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. VWAP Liquidity Tracker */}
            <div className="grid grid-cols-2 gap-3">
                <div className={`p-4 rounded-3xl border ${liquidityTaken.buySide ? 'bg-red-500/10 border-red-500/20' : 'bg-black/20 border-white/5'}`}>
                    <div className="text-[8px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">W-Max Liq.</div>
                    <div className="flex items-center gap-2">
                        {liquidityTaken.buySide ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Shield className="w-4 h-4 text-gray-600" />}
                        <span className={`text-[10px] font-black uppercase ${liquidityTaken.buySide ? 'text-red-400' : 'text-gray-600'}`}>
                            {liquidityTaken.buySide ? 'Swept' : 'Untouched'}
                        </span>
                    </div>
                </div>
                <div className={`p-4 rounded-3xl border ${liquidityTaken.sellSide ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-black/20 border-white/5'}`}>
                    <div className="text-[8px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">W-Min Liq.</div>
                    <div className="flex items-center gap-2">
                        {liquidityTaken.sellSide ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <Shield className="w-4 h-4 text-gray-600" />}
                        <span className={`text-[10px] font-black uppercase ${liquidityTaken.sellSide ? 'text-emerald-400' : 'text-gray-600'}`}>
                            {liquidityTaken.sellSide ? 'Swept' : 'Untouched'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 4. VWAP Playbook */}
            <div className="p-7 bg-gradient-to-br from-cyan-900/40 to-black/60 rounded-[3rem] border border-cyan-500/30 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12 scale-150">
                    <Zap className="w-40 h-40 text-cyan-500" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/40">
                            <Zap className="w-4 h-4 text-cyan-400" />
                        </div>
                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">VWAP Playbook</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="p-5 bg-black/60 rounded-2xl border border-white/5 backdrop-blur-3xl shadow-inner">
                            <div className="text-[8px] font-black text-cyan-400 uppercase tracking-[0.3em] mb-3">SCENARIO TRIGGER</div>
                            <p className="text-[11px] text-gray-300 font-bold leading-relaxed italic">
                                {current.state === 'ACCEPT ABOVE' ? "Price accepted above Weekly VWAP Max. Bullish expansion in play — look for continuation longs above this structural level." :
                                    current.state === 'ACCEPT BELOW' ? "Price accepted below Weekly VWAP Min. Bearish expansion — shorts favored until reclaim of W-Min." :
                                        current.mss ? `Confirmed MSS ${current.mss} after VWAP sweep. Structural reversal initiated.` :
                                            current.lastSweep ? `VWAP liquidity swept (${current.lastSweep}). Monitor for MSS to confirm high-conviction entry.` :
                                                metrics.normalizedSlope > 0.2 ? "Bullish VWAP slope with price inside range. Wait for W-Max acceptance or W-Min sweep for entry." :
                                                    metrics.normalizedSlope < -0.2 ? "Bearish VWAP slope with price inside range. Wait for W-Min break or W-Max sweep reversal." :
                                                        "Price consolidating within Weekly VWAP channel. Neutral — wait for directional sweep or acceptance."}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1">VWAP Structural Targets</div>
                            <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all cursor-crosshair">
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">W-VWAP MID</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-white tracking-widest">${formatPrice(metrics.wMid)}</span>
                                </div>
                                <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5 hover:border-red-500/30 transition-all cursor-crosshair">
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">W-VWAP MAX</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-white tracking-widest">${formatPrice(metrics.wMax)}</span>
                                </div>
                                <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all cursor-crosshair">
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">W-VWAP MIN</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-white tracking-widest">${formatPrice(metrics.wMin)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${current.bias.includes('Neutral') ? 'bg-gray-800/20 border-gray-700/50' : 'bg-red-500/10 border-red-500/20'}`}>
                                <Shield className={`w-4 h-4 ${current.bias.includes('Neutral') ? 'text-gray-500' : 'text-red-500'}`} />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-rose-400 uppercase tracking-[0.2em] mb-0.5">Invalidation</span>
                                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">
                                        {current.state.includes('ACCEPT') ? "15M RE-ENTRY INTO VWAP RANGE" : "CLOSE BELOW W-MIN / ABOVE W-MAX"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Slope Indicator */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/40 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${metrics.normalizedSlope > 0.1 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : metrics.normalizedSlope < -0.1 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' : 'bg-gray-600'}`} />
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">VWAP Slope</span>
                </div>
                <span className={`text-xs font-black font-mono ${metrics.normalizedSlope > 0.1 ? 'text-emerald-400' : metrics.normalizedSlope < -0.1 ? 'text-rose-400' : 'text-gray-400'}`}>
                    {metrics.normalizedSlope > 0 ? '+' : ''}{metrics.normalizedSlope.toFixed(3)}
                </span>
            </div>
        </div>
    );
};
