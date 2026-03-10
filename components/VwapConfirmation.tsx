
import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Zap, ArrowUpRight, Clock, Target } from 'lucide-react';

interface VwapCandidate {
    symbol: string;
    price: number;
    density: number;
    vwap: {
        max: number;
        min: number;
        mid: number;
    };
}

export const VwapConfirmation: React.FC<{ onTickerClick: (symbol: string) => void }> = ({ onTickerClick }) => {
    const [candidates, setCandidates] = useState<VwapCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastScan, setLastScan] = useState<Date>(new Date());

    const fetchCandidates = async () => {
        try {
            const res = await fetch('/api/vwap-confirmed');
            if (res.ok) {
                const data = await res.json();
                setCandidates(data);
                setLastScan(new Date());
            }
        } catch (e) {
            console.error('Failed to fetch vwap candidates:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCandidates();
        const interval = setInterval(fetchCandidates, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3">
                        <Target className="w-8 h-8 text-green-500" />
                        VWAP Confirmation
                    </h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Real-Time Structural Breakouts (Super-Trend Hierarchy)</p>
                </div>
                <div className="flex items-center gap-3 bg-[#12141c] rounded-xl p-1 border border-gray-800">
                    <span className="px-4 py-1.5 text-xs font-black text-green-400 uppercase tracking-widest animate-pulse">Confirmed: {candidates.length}</span>
                    <div className="h-4 w-px bg-gray-800" />
                    <span className="px-4 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest">Update: {lastScan.toLocaleTimeString()}</span>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-[#0a0c12] rounded-3xl border border-dashed border-gray-800">
                    <Activity className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Scanning Structural Candidates...</p>
                </div>
            ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-[#0a0c12] rounded-3xl border border-dashed border-red-900/30">
                    <ShieldCheck className="w-12 h-12 text-gray-800 mb-4" />
                    <h3 className="text-white font-black uppercase italic text-lg">No Confirmations Found</h3>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] mt-2">Waiting for Super-Trend Alignment (Mid &gt; Max &gt; Min)</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {candidates.map((cand) => (
                        <div
                            key={cand.symbol}
                            onClick={() => onTickerClick(cand.symbol)}
                            className="bg-[#0e1117] border border-gray-800 hover:border-green-500/50 rounded-2xl p-5 transition-all group cursor-pointer relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-20 transition-opacity">
                                <Target className="w-16 h-16 text-white" />
                            </div>

                            <div className="flex items-center justify-between mb-4 relative">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center border border-green-500/20 group-hover:scale-110 transition-transform">
                                        <ArrowUpRight className="text-green-500 w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-white italic tracking-tighter">{cand.symbol.replace('USDT', '')}</h3>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">{cand.symbol}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black text-white tracking-tighter">${cand.price.toFixed(4)}</div>
                                    <div className="flex items-center gap-1 justify-end">
                                        <Zap className="w-3 h-3 text-yellow-500" />
                                        <span className="text-[10px] font-black text-yellow-500 uppercase">Density: {cand.density}%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-800">
                                <div className="text-center">
                                    <p className="text-[8px] text-gray-500 font-black uppercase mb-1">Weekly Max</p>
                                    <p className="text-xs font-bold text-gray-300">${cand.vwap.max.toFixed(3)}</p>
                                </div>
                                <div className="text-center bg-green-500/5 rounded-lg py-1 border border-green-500/10">
                                    <p className="text-[8px] text-green-500 font-black uppercase mb-1">Daily Mid</p>
                                    <p className="text-xs font-black text-green-400">${cand.vwap.mid.toFixed(3)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[8px] text-gray-500 font-black uppercase mb-1">Weekly Min</p>
                                    <p className="text-xs font-bold text-gray-300">${cand.vwap.min.toFixed(3)}</p>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                <span className="text-green-500 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Structure Confirmed</span>
                                <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Scan Live</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
