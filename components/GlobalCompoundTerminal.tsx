
import React, { useState, useEffect } from 'react';
import { Zap, Trophy, TrendingUp, Timer, ShieldCheck, Target, RefreshCcw, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { historicalHunts } from '../src/data/historicalHunts';

interface ActiveHunt {
    symbol: string;
    entryPrice: number;
    entryTime: string;
    peakPrice: number;
    currentPrice?: number;
    status: 'active' | 'closed';
    exitPrice?: number;
    exitTime?: string;
    pnl?: number;
    capital: number;
    tier?: number;
    strategyId?: string;
}

interface TerminalProps {
    strategyId?: string;
    title?: string;
    subtitle?: string;
}

export const GlobalCompoundTerminal: React.FC<TerminalProps> = ({
    strategyId = 'golden_signal',
    title = 'Golden Signal Terminal',
    subtitle = 'Advanced Multi-Tier Trailing & Collective Capital Reinvestment'
}) => {
    const [hunts, setHunts] = useState<ActiveHunt[]>(historicalHunts as ActiveHunt[]);
    const [loading, setLoading] = useState(false);
    const [lastSync, setLastSync] = useState(new Date());
    const [isServerConnected, setIsServerConnected] = useState(false);

    const fetchHunts = async () => {
        try {
            const res = await fetch('/api/hunts');
            if (res.ok) {
                const data = await res.json();
                setIsServerConnected(true);
                if (Array.isArray(data)) {
                    // Filter by strategy if provided.
                    // If golden_signal, include legacy trades (no strategyId).
                    const filtered = strategyId
                        ? data.filter((h: any) => {
                            if (strategyId === 'golden_signal') {
                                return h.strategyId === 'golden_signal' || !h.strategyId;
                            }
                            return h.strategyId === strategyId;
                        })
                        : data;
                    setHunts(filtered);
                    setLastSync(new Date());
                }
            } else {
                setIsServerConnected(false);
            }
        } catch (err) {
            console.error('Failed to fetch hunts:', err);
            setIsServerConnected(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHunts();
        const interval = setInterval(fetchHunts, 5000); // Sync every 5s for ultra-live feel
        return () => clearInterval(interval);
    }, []);

    const activeCount = hunts.filter(h => h.status === 'active').length;
    const totalPnL = hunts.reduce((acc, h) => acc + (h.pnl || 0), 0);
    const winRate = hunts.length > 0 ? (hunts.filter(h => (h.pnl || 0) > 0).length / hunts.length) * 100 : 0;
    const compoundingBalance = hunts.reduce((acc, h) => acc + h.capital * (1 + (h.pnl || 0) / 100), 0);
    const initialCapital = hunts.reduce((acc, h) => acc + h.capital, 0);

    return (
        <div className="space-y-6">
            {/* --- Header Section --- */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-8 bg-blue-500 rounded-full animate-pulse" />
                        <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">{title}</h2>
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 rounded uppercase tracking-widest">v7-Server Linked</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 ml-4">{subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchHunts}
                        className="flex items-center gap-2 px-4 py-2 bg-[#12141c] hover:bg-[#1a1d29] border border-gray-800 rounded-xl transition-all group"
                    >
                        <RefreshCcw className={`w-4 h-4 text-gray-400 group-hover:rotate-180 transition-all duration-700 ${loading ? 'animate-spin' : ''}`} />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sync Database</span>
                    </button>
                    <div className="flex bg-[#12141c] border border-gray-800 rounded-xl px-4 py-2 gap-4">
                        <div className="flex items-center gap-2 pr-4 border-r border-gray-800/50">
                            <div className={`w-2 h-2 rounded-full ${isServerConnected ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isServerConnected ? 'text-green-500' : 'text-red-500'}`}>
                                {isServerConnected ? 'Satellite Linked' : 'Link Offline'}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Last Sync</span>
                            <span className="text-xs font-mono text-cyan-500">{lastSync.toLocaleTimeString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Stats Overview --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    label="Current Hunt Active"
                    value={activeCount.toString()}
                    subValue={`Across 350+ Pairs`}
                    icon={<Activity className="w-5 h-5 text-blue-400" />}
                />
                <StatCard
                    label="Cumulative PnL"
                    value={`${totalPnL > 0 ? '+' : ''}${totalPnL.toFixed(2)}%`}
                    subValue="Historical Aggregate"
                    color={totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}
                    icon={<TrendingUp className="w-5 h-5 text-green-400" />}
                />
                <StatCard
                    label="Compound Balance"
                    value={`$${compoundingBalance.toFixed(2)}`}
                    subValue={`Initial $${initialCapital.toFixed(2)}`}
                    color="text-white"
                    icon={<Zap className="w-5 h-5 text-yellow-400" />}
                />
                <StatCard
                    label="Success Velocity"
                    value={`${winRate.toFixed(1)}%`}
                    subValue="Signal Accuracy"
                    icon={<Trophy className="w-5 h-5 text-purple-400" />}
                />
            </div>

            {/* --- Active Trades Table --- */}
            <div className="bg-[#0c0e14] border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-500/5 to-transparent">
                    <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-black text-white uppercase tracking-widest">Live Strategy Execution</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[#12141c]/50 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                <th className="px-6 py-4">Pair / Session</th>
                                <th className="px-6 py-4">Entry / Current</th>
                                <th className="px-6 py-4">Peak / Distance</th>
                                <th className="px-6 py-4">Profit Tier</th>
                                <th className="px-6 py-4">Live PnL</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                            {hunts.sort((a, b) => b.entryTime.localeCompare(a.entryTime)).map((hunt, idx) => (
                                <HuntRow key={idx} hunt={hunt} />
                            ))}
                        </tbody>
                    </table>
                    {!loading && hunts.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-gray-600">
                            <Target className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-sm font-bold uppercase tracking-widest opacity-40">No active hunts in registry</p>
                            <p className="text-[10px] uppercase tracking-wider opacity-30 mt-1">Waiting for next v7 Golden Signal...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: string; subValue: string; color?: string; icon: React.ReactNode }> = ({ label, value, subValue, color = 'text-white', icon }) => (
    <div className="bg-[#0c0e14] border border-gray-800 rounded-2xl p-5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
            {icon}
        </div>
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{label}</span>
        <div className={`text-2xl font-black italic tracking-tighter ${color} mb-1`}>{value}</div>
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{subValue}</span>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
    </div>
);

const HuntRow: React.FC<{ hunt: ActiveHunt }> = ({ hunt }) => {
    const isClosed = hunt.status === 'closed';
    const pnl = hunt.pnl ?? ((hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
    const isPositive = pnl >= 0;

    return (
        <tr className={`hover:bg-[#12141c]/30 transition-colors ${isClosed ? 'opacity-60' : ''}`}>
            <td className="px-6 py-5">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${isClosed ? 'bg-gray-800 text-gray-500' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                        {hunt.symbol.slice(0, 2)}
                    </div>
                    <div>
                        <div className="text-sm font-black text-white italic tracking-tighter uppercase">{hunt.symbol}</div>
                        <div className="text-[9px] text-gray-500 font-bold uppercase tracking-tight">{new Date(hunt.entryTime).toLocaleString()}</div>
                    </div>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="space-y-1">
                    <div className="text-xs font-mono text-gray-400">IN: ${hunt.entryPrice.toLocaleString()}</div>
                    {!isClosed && <div className="text-xs font-mono text-white animate-pulse">LIV: ${(hunt.currentPrice || hunt.peakPrice).toLocaleString()}</div>}
                    {isClosed && <div className="text-xs font-mono text-gray-500 italic">OUT: ${hunt.exitPrice?.toLocaleString()}</div>}
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="space-y-1">
                    <div className="text-xs font-mono text-cyan-400 tracking-tighter">PEAK: ${hunt.peakPrice.toLocaleString()}</div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                        {isClosed ? 'FINAL MOVE' : `FROM ENTRY: +${((hunt.peakPrice - hunt.entryPrice) / hunt.entryPrice * 100).toFixed(2)}%`}
                    </div>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="flex items-center gap-2">
                    {[1, 2, 3].map(t => (
                        <div
                            key={t}
                            className={`w-6 h-1.5 rounded-full ${hunt.tier && hunt.tier >= t ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-gray-800'}`}
                        />
                    ))}
                    <span className="text-[10px] font-black text-gray-500 ml-1">T{hunt.tier || 1}</span>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className={`flex items-center gap-1 text-sm font-black italic tracking-tighter ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {pnl.toFixed(2)}%
                </div>
            </td>
            <td className="px-6 py-5 text-right">
                {isClosed ? (
                    <span className="px-3 py-1 bg-gray-800/50 text-gray-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-gray-800">Archived</span>
                ) : (
                    <div className="flex items-center justify-end gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                        <span className="text-green-500 text-[9px] font-black uppercase tracking-widest">Tracking Live</span>
                    </div>
                )}
            </td>
        </tr>
    );
};
