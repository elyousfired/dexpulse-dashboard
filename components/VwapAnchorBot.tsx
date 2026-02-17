import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Table, TrendingUp, TrendingDown, RefreshCw, Zap, Info, ArrowRight, BarChart3, Clock, Filter, Bot } from 'lucide-react';
import { CexTicker } from '../types';
import { getSlidingAVWAPData, AnchoredVwapResult } from '../services/avwapTradingService';
import { formatPrice, VwapData } from '../services/cexService';

interface VwapAnchorBotProps {
    tickers: CexTicker[];
    vwapStore: Record<string, VwapData>;
    onTickerClick: (ticker: CexTicker) => void;
}

export const VwapAnchorBot: React.FC<VwapAnchorBotProps> = ({ tickers, vwapStore, onTickerClick }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC');
    const [timeframe, setTimeframe] = useState<number>(15);
    const [loading, setLoading] = useState(false);
    const [detailData, setDetailData] = useState<{ current: AnchoredVwapResult; previous: AnchoredVwapResult; signal: 'LONG' | 'EXIT' | 'IDLE' } | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [botActive, setBotActive] = useState(true);

    // 1. Filter tokens by Price > 1D VWAP (mid)
    const filteredBy1D = useMemo(() => {
        return tickers.filter(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return false;
            return t.priceUsd > vwap.mid;
        });
    }, [tickers, vwapStore]);

    const fetchVwapData = useCallback(async () => {
        if (!selectedSymbol) return;
        setLoading(true);
        const result = await getSlidingAVWAPData(selectedSymbol, timeframe);
        if (result) {
            setDetailData(result);
            setLastUpdate(new Date());
        }
        setLoading(false);
    }, [selectedSymbol, timeframe]);

    useEffect(() => {
        fetchVwapData();
        const interval = setInterval(fetchVwapData, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, [fetchVwapData]);

    const activeTicker = tickers.find(t => t.symbol === selectedSymbol);

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                        <Bot className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">VWAP Anchor Bot</h2>
                        <p className="text-xs text-emerald-400/60 font-medium font-mono lowercase">Automated 1D Convergence & 2-Candle sliding engine</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Bot Active</span>
                    </div>

                    <button
                        onClick={fetchVwapData}
                        disabled={loading}
                        className="p-3 bg-gray-800/50 hover:bg-gray-700 rounded-xl border border-gray-700 transition-all"
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    <div className="flex bg-black/40 rounded-xl p-1 border border-gray-800">
                        {[5, 15, 60].map(tf => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${timeframe === tf ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                {tf < 60 ? `${tf}M` : '1H'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Bot Scanner (Filtered by 1D VWAP) */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-[#12141c] rounded-2xl border border-gray-800 p-5 shadow-lg flex flex-col h-[600px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-emerald-400" />
                                <h3 className="text-xs font-black text-white uppercase tracking-widest">Bot Filter (P &gt; 1D VWAP)</h3>
                            </div>
                            <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                                {filteredBy1D.length} Matches
                            </span>
                        </div>

                        <div className="relative mb-4">
                            <input
                                type="text"
                                placeholder="Refine by symbol..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/60 text-white text-sm px-4 py-3 rounded-xl border border-gray-700 focus:outline-none focus:border-emerald-500 transition-all"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                            {filteredBy1D
                                .filter(t => t.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedSymbol(t.symbol)}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedSymbol === t.symbol
                                                ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                                                : 'bg-black/20 border-gray-800 text-gray-400 hover:border-gray-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center font-black text-xs text-white">
                                                {t.symbol[0]}
                                            </div>
                                            <div className="text-left">
                                                <div className="font-bold text-sm tracking-tighter">{t.symbol}/USDT</div>
                                                <div className="text-[9px] text-emerald-500/60 font-black uppercase">Above 1D VWAP</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-mono font-bold text-white">${formatPrice(t.priceUsd)}</div>
                                            <div className={`text-[9px] font-black ${t.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {t.priceChangePercent24h > 0 ? '+' : ''}{t.priceChangePercent24h.toFixed(2)}%
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            {filteredBy1D.length === 0 && (
                                <div className="py-20 text-center flex flex-col items-center justify-center">
                                    <Info className="w-8 h-8 text-gray-700 mb-2" />
                                    <p className="text-[10px] text-gray-600 font-bold uppercase">No tokens meeting 1D filter criteria</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Active Signal Card */}
                    {detailData && (
                        <div className={`p-6 rounded-2xl border shadow-xl flex flex-col items-center justify-center text-center space-y-4 ${detailData.signal === 'LONG' ? 'bg-emerald-500/10 border-emerald-500/30' :
                                detailData.signal === 'EXIT' ? 'bg-rose-500/10 border-rose-500/30' :
                                    'bg-gray-800/10 border-gray-800'
                            }`}>
                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">operational Status: {selectedSymbol}</div>
                            <div className={`text-4xl font-black italic tracking-tighter ${detailData.signal === 'LONG' ? 'text-emerald-400' :
                                    detailData.signal === 'EXIT' ? 'text-rose-400' :
                                        'text-gray-400'
                                }`}>
                                {detailData.signal === 'LONG' ? 'ENTER LONG' :
                                    detailData.signal === 'EXIT' ? 'EXIT NOW' :
                                        'IDLE'}
                            </div>
                            <div className="flex items-center gap-2">
                                {detailData.signal === 'LONG' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> :
                                    detailData.signal === 'EXIT' ? <TrendingDown className="w-5 h-5 text-rose-400" /> :
                                        <BarChart3 className="w-5 h-5 text-gray-500" />}
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-tighter">
                                    {detailData.signal === 'LONG' ? 'C_Vwap > P_Vwap (Momentum Confirmation)' :
                                        detailData.signal === 'EXIT' ? 'C_Vwap < P_Vwap (Trend Breakout Failure)' :
                                            'No definitive direction'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: Calculation Deep Dive */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[#12141c] rounded-2xl border border-gray-800 overflow-hidden shadow-lg">
                        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/20 rounded-lg">
                                    <Table className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Anchored Matrix: {selectedSymbol}</h3>
                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tight">Calculation Breakdown (1m resolution)</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono bg-black/40 px-3 py-1.5 rounded-lg border border-gray-800">
                                <Clock className="w-3 h-3" />
                                SYNC: {lastUpdate.toLocaleTimeString()}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-black/40">
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Bot Execution Layer</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Anchor (Open)</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Typ Price</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Accum. Volume</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase pt-4">AVWAP RESULT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {detailData ? (
                                        <>
                                            {/* Previous Candle */}
                                            <tr className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-gray-600" />
                                                        <span className="text-xs font-black text-gray-500 uppercase">Shift Previous ({timeframe}m)</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-gray-500">
                                                        {new Date(detailData.previous.candleOpenTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono font-bold text-gray-500">
                                                        ${formatPrice(detailData.previous.lastTypicalPrice)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-gray-500 uppercase">
                                                        ${(detailData.previous.cumulativeSumV / 1e3).toFixed(1)}K
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-mono font-black text-gray-300">
                                                        ${formatPrice(detailData.previous.vwap)}
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* Current Candle */}
                                            <tr className="bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                                        <span className="text-xs font-black text-emerald-400 uppercase tracking-tighter">Live Current Tracking</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-emerald-500/60">
                                                        {new Date(detailData.current.candleOpenTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono font-bold text-white">
                                                        ${formatPrice(detailData.current.lastTypicalPrice)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-emerald-400/70 uppercase">
                                                        ${(detailData.current.cumulativeSumV / 1e3).toFixed(1)}K
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className={`text-base font-mono font-black ${detailData.current.vwap > detailData.previous.vwap ? 'text-emerald-400' : 'text-rose-400'
                                                        }`}>
                                                        ${formatPrice(detailData.current.vwap)}
                                                    </div>
                                                </td>
                                            </tr>
                                        </>
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-24 text-center">
                                                <BarChart3 className="w-12 h-12 text-gray-800 mx-auto mb-4 animate-pulse" />
                                                <p className="text-gray-500 text-sm font-black uppercase tracking-widest">Initializing Bot Data Streams...</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Bot Logic Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#12141c] rounded-2xl border border-emerald-500/20 p-5 flex items-start gap-4">
                            <div className="p-3 bg-emerald-500/20 rounded-xl">
                                <Zap className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">Entry Filter A: 1D Convergence</h4>
                                <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                                    ONLY tokens trading ABOVE their Daily VWAP are scanned. This filters out bear-market noise and focus on
                                    assets with institutional support for the current day.
                                </p>
                            </div>
                        </div>
                        <div className="bg-[#12141c] rounded-2xl border border-indigo-500/20 p-5 flex items-start gap-4">
                            <div className="p-3 bg-indigo-500/20 rounded-xl">
                                <TrendingUp className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">Entry Filter B: AVWAP Momentum</h4>
                                <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                                    We execute a "Sliding Comparison". If the live average price of the current {timeframe}m candle exceeds
                                    the previous final average, the trend is confirmed as accelerating.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
