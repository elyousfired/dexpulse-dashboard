
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker, OHLCV } from '../types';
import { fetchCexTickers, fetchBinanceKlines } from '../services/cexService';
import {
    partitionKlinesBySession,
    analyzeSessionPhase,
    predictNextBias,
    MarketStructure,
    MarketPhase,
    Verdict
} from '../services/structureService';
import {
    Globe,
    Zap,
    Magnet,
    Rocket,
    MousePointer2,
    RefreshCw,
    Clock,
    TrendingUp,
    AlertCircle,
    ArrowRight
} from 'lucide-react';

interface MarketStructureDashboardProps {
    onTickerClick?: (ticker: CexTicker) => void;
}

export const MarketStructureDashboard: React.FC<MarketStructureDashboardProps> = ({ onTickerClick }) => {
    const [structures, setStructures] = useState<MarketStructure[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1. Get Top Tickers by Volume
            const allTickers = await fetchCexTickers();
            const top50 = allTickers.slice(0, 50);

            const newStructures: MarketStructure[] = [];

            // 2. Process each ticker (In batches of 5 to avoid heavy UI freeze/rate limits)
            for (let i = 0; i < top50.length; i += 5) {
                const batch = top50.slice(i, i + 5);

                await Promise.all(batch.map(async (ticker) => {
                    // Fetch 15m klines for last 24h (approx 96 candles)
                    const klines = await fetchBinanceKlines(ticker.symbol, '15m', 100);
                    if (klines.length === 0) return;

                    const { asia, london, ny } = partitionKlinesBySession(klines);

                    // We need a starting price for each session to calculate volatility properly
                    const asiaStart = asia[0]?.open || ticker.priceUsd;
                    const londonStart = london[0]?.open || ticker.priceUsd;
                    const nyStart = ny[0]?.open || ticker.priceUsd;

                    newStructures.push({
                        symbol: ticker.symbol,
                        asia: analyzeSessionPhase(asia, asiaStart),
                        london: analyzeSessionPhase(london, londonStart),
                        ny: analyzeSessionPhase(ny, nyStart),
                        lastUpdated: Date.now()
                    });
                }));
            }

            setStructures(newStructures);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('[StructureDashboard] Load Error:', err);
            setError('Failed to load market structure data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 15 * 60 * 1000); // 15 min cycle
        return () => clearInterval(interval);
    }, []);

    const getPhaseStyle = (phase: MarketPhase) => {
        switch (phase) {
            case 'ACCUMULATION':
                return {
                    icon: <Magnet className="w-4 h-4" />,
                    text: 'Accumulation',
                    bg: 'bg-cyan-500/10',
                    border: 'border-cyan-500/20',
                    color: 'text-cyan-400'
                };
            case 'EXPANSION':
                return {
                    icon: <Rocket className="w-4 h-4" />,
                    text: 'Expansion',
                    bg: 'bg-purple-500/10',
                    border: 'border-purple-500/20',
                    color: 'text-purple-400'
                };
            case 'DISTRIBUTION':
                return {
                    icon: <Globe className="w-4 h-4" />,
                    text: 'Distribution',
                    bg: 'bg-orange-500/10',
                    border: 'border-orange-500/20',
                    color: 'text-orange-400'
                };
            case 'SCANNING':
                return {
                    icon: <RefreshCw className="w-4 h-4 animate-spin opacity-50" />,
                    text: 'Scanning',
                    bg: 'bg-gray-500/5',
                    border: 'border-gray-500/10',
                    color: 'text-gray-500'
                };
            default:
                return {
                    icon: <Clock className="w-4 h-4 opacity-30" />,
                    text: 'Waiting',
                    bg: 'bg-white/5',
                    border: 'border-white/5',
                    color: 'text-gray-600'
                };
        }
    };

    if (loading && structures.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-400">
                <RefreshCw className="w-10 h-10 animate-spin text-purple-500 mb-6 opacity-40" />
                <h3 className="text-sm font-black uppercase tracking-widest animate-pulse">Analyzing Global Market Structure...</h3>
                <p className="text-[10px] mt-2 text-gray-500 uppercase font-bold tracking-tighter">Calculating 15m VWAP snapshots across Top 50 Vol/Pairs</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 animate-in fade-in duration-500">
            {/* Header / Info Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-xl">
                        <Zap className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-white uppercase tracking-tight">Market Structure Monitor</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                <Clock className="w-3 h-3" /> Updated: {lastRefresh.toLocaleTimeString()}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-black text-emerald-500/70 uppercase">LIVE CALCULATION (15M)</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 grayscale opacity-60">
                            <Magnet className="w-3 h-3 text-cyan-400" />
                            <span className="text-[9px] font-black text-gray-400 uppercase">ACCUM</span>
                        </div>
                        <div className="flex items-center gap-1.5 grayscale opacity-60">
                            <Rocket className="w-3 h-3 text-purple-400" />
                            <span className="text-[9px] font-black text-gray-400 uppercase">EXPAN</span>
                        </div>
                        <div className="flex items-center gap-1.5 grayscale opacity-60">
                            <Globe className="w-3 h-3 text-orange-400" />
                            <span className="text-[9px] font-black text-gray-400 uppercase">DISTR</span>
                        </div>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-95 disabled:opacity-30"
                    >
                        <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-[#0a0a0f] rounded-2xl border border-white/5 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5">
                            <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Ticker</th>
                            <th className="px-6 py-4 text-[10px] font-black text-blue-400 uppercase tracking-widest text-center">Asia Session</th>
                            <th className="px-6 py-4 text-[10px] font-black text-purple-400 uppercase tracking-widest text-center">London Open</th>
                            <th className="px-6 py-4 text-[10px] font-black text-orange-400 uppercase tracking-widest text-center">NY Dominance</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Verdict Prediction</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                        {structures.map((sig) => (
                            <tr key={sig.symbol} className="group hover:bg-white/[0.02] transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-black text-xs text-gray-400 uppercase">
                                            {sig.symbol[0]}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-white group-hover:text-purple-400 transition-colors uppercase tracking-tighter">
                                                {sig.symbol}
                                            </span>
                                            <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Binance USDT</span>
                                        </div>
                                    </div>
                                </td>

                                {/* Session Slots */}
                                {[sig.asia, sig.london, sig.ny].map((session, idx) => {
                                    const style = getPhaseStyle(session.phase);
                                    return (
                                        <td key={idx} className="px-6 py-4">
                                            <div className="flex flex-col items-center">
                                                <div className={`
                                                    flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300
                                                    ${style.bg} ${style.border} ${style.color}
                                                `}>
                                                    {style.icon}
                                                    <span className="text-[10px] font-black uppercase tracking-tighter">
                                                        {style.text}
                                                    </span>
                                                </div>
                                                {session.phase !== 'SCANNING' && session.phase !== 'UNKNOWN' && (
                                                    <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-[8px] font-mono font-bold text-gray-600">
                                                            V: {session.volatility.toFixed(1)}%
                                                        </span>
                                                        <span className="text-[8px] font-mono font-bold text-gray-600">
                                                            D: {session.distanceToVwap.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}

                                {/* Verdict Column */}
                                {(() => {
                                    const verdict = predictNextBias(sig.asia, sig.london, sig.ny);
                                    return (
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center">
                                                <div
                                                    title={verdict.description}
                                                    className={`
                                                        px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-tighter
                                                        transition-all duration-500 cursor-help
                                                        ${verdict.color} bg-white/5 border-white/10
                                                        ${verdict.isHot ? 'animate-pulse shadow-[0_0_20px_rgba(251,146,60,0.2)] border-orange-500/40' : 'opacity-80'}
                                                    `}
                                                >
                                                    {verdict.label}
                                                </div>
                                                <div className="flex items-center gap-1 mt-1.5 grayscale opacity-50">
                                                    <TrendingUp className="w-2.5 h-2.5" />
                                                    <span className="text-[8px] font-black uppercase">{verdict.confidence}% Conf</span>
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })()}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer Notice */}
            <div className="flex items-center gap-2 justify-center py-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl">
                <AlertCircle className="w-3 h-3 text-orange-400" />
                <p className="text-[9px] font-bold text-orange-400/80 uppercase tracking-widest">
                    Structural analysis is predictive of future bias. Do not use alone for entry.
                </p>
            </div>
        </div>
    );
};
