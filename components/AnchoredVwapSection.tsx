import React, { useState, useEffect, useCallback } from 'react';
import { Search, Table, TrendingUp, TrendingDown, RefreshCw, Zap, Info, ArrowRight, BarChart3, Clock } from 'lucide-react';
import { CexTicker } from '../types';
import { getSlidingAVWAPData, AnchoredVwapResult } from '../services/avwapTradingService';
import { formatPrice } from '../services/cexService';

interface AnchoredVwapSectionProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

export const AnchoredVwapSection: React.FC<AnchoredVwapSectionProps> = ({ tickers, onTickerClick }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC');
    const [timeframe, setTimeframe] = useState<number>(15);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ current: AnchoredVwapResult; previous: AnchoredVwapResult; signal: 'LONG' | 'EXIT' | 'IDLE' } | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchVwapData = useCallback(async () => {
        if (!selectedSymbol) return;
        setLoading(true);
        const result = await getSlidingAVWAPData(selectedSymbol, timeframe);
        if (result) {
            setData(result);
            setLastUpdate(new Date());
        }
        setLoading(false);
    }, [selectedSymbol, timeframe]);

    useEffect(() => {
        fetchVwapData();
        const interval = setInterval(fetchVwapData, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, [fetchVwapData]);

    const filteredTickers = searchQuery
        ? tickers.filter(t => t.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
        : tickers.slice(0, 10);

    const activeTicker = tickers.find(t => t.symbol === selectedSymbol);

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                        <Zap className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">AVWAP Anchor Analysis</h2>
                        <p className="text-xs text-emerald-400/60 font-medium font-mono lowercase">Sliding 2-Candle Momentum Engine</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
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
                {/* Left Side: Search & Selector */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-[#12141c] rounded-2xl border border-gray-800 p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-4">
                            <Search className="w-4 h-4 text-emerald-400" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">Select Token</h3>
                        </div>

                        <div className="relative mb-4">
                            <input
                                type="text"
                                placeholder="Search symbol (e.g. BTC, ETH...)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/60 text-white text-sm px-4 py-3 rounded-xl border border-gray-700 focus:outline-none focus:border-emerald-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            {filteredTickers.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedSymbol(t.symbol)}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedSymbol === t.symbol
                                            ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                                            : 'bg-black/20 border-gray-800 text-gray-400 hover:border-gray-600'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center font-black text-xs">
                                            {t.symbol[0]}
                                        </div>
                                        <span className="font-bold">{t.symbol}</span>
                                    </div>
                                    <span className="text-xs font-mono text-gray-500">${formatPrice(t.priceUsd)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active Signal Card */}
                    {data && (
                        <div className={`p-6 rounded-2xl border shadow-xl flex flex-col items-center justify-center text-center space-y-4 ${data.signal === 'LONG' ? 'bg-emerald-500/10 border-emerald-500/30' :
                                data.signal === 'EXIT' ? 'bg-rose-500/10 border-rose-500/30' :
                                    'bg-gray-800/10 border-gray-800'
                            }`}>
                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Operational Status</div>
                            <div className={`text-4xl font-black italic tracking-tighter ${data.signal === 'LONG' ? 'text-emerald-400' :
                                    data.signal === 'EXIT' ? 'text-rose-400' :
                                        'text-gray-400'
                                }`}>
                                {data.signal === 'LONG' ? 'ENTER LONG' :
                                    data.signal === 'EXIT' ? 'EXIT IMMEDIATELY' :
                                        'IDLE / SCANNING'}
                            </div>
                            <div className="flex items-center gap-2">
                                {data.signal === 'LONG' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> :
                                    data.signal === 'EXIT' ? <TrendingDown className="w-5 h-5 text-rose-400" /> :
                                        <BarChart3 className="w-5 h-5 text-gray-500" />}
                                <span className="text-xs font-bold text-gray-500">
                                    {data.signal === 'LONG' ? 'Vwap_C > Vwap_P (Momentum UP)' :
                                        data.signal === 'EXIT' ? 'Vwap_C < Vwap_P (Momentum DOWN)' :
                                            'No significant deviation detected'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: Calculation Table */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[#12141c] rounded-2xl border border-gray-800 overflow-hidden shadow-lg">
                        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Table className="w-4 h-4 text-emerald-400" />
                                <h3 className="text-xs font-black text-white uppercase tracking-widest">Anchored Calculations ({selectedSymbol})</h3>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                                <Clock className="w-3 h-3" />
                                Updated: {lastUpdate.toLocaleTimeString()}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-black/40">
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Candle Context</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Anchor Start</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Typical Price</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">Cumul. Volume</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">AVWAP (Result)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {data ? (
                                        <>
                                            {/* Previous Candle */}
                                            <tr className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-gray-500" />
                                                        <span className="text-xs font-black text-gray-400 uppercase">Previous Candle</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-gray-500">
                                                        {new Date(data.previous.candleOpenTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono font-bold text-gray-400">
                                                        ${formatPrice(data.previous.lastTypicalPrice)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-gray-500">
                                                        ${(data.previous.cumulativeSumV / 1e3).toFixed(2)}K
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-mono font-black text-white">
                                                        ${formatPrice(data.previous.vwap)}
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* Current Candle */}
                                            <tr className="bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span className="text-xs font-black text-emerald-400 uppercase tracking-tighter">Current (Live)</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-emerald-500/60">
                                                        {new Date(data.current.candleOpenTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono font-bold text-white">
                                                        ${formatPrice(data.current.lastTypicalPrice)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-xs font-mono text-emerald-400/70">
                                                        ${(data.current.cumulativeSumV / 1e3).toFixed(2)}K
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className={`text-sm font-mono font-black ${data.current.vwap > data.previous.vwap ? 'text-emerald-400' : 'text-rose-400'
                                                        }`}>
                                                        ${formatPrice(data.current.vwap)}
                                                    </div>
                                                </td>
                                            </tr>
                                        </>
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center">
                                                <BarChart3 className="w-10 h-10 text-gray-700 mx-auto mb-4" />
                                                <p className="text-gray-500 text-sm font-bold">Waiting for market data streams...</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Educational Note */}
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 flex gap-4">
                        <Info className="w-12 h-12 text-blue-400 shrink-0" />
                        <div className="space-y-2">
                            <h4 className="text-sm font-black text-white uppercase italic">Strategy Deep Dive</h4>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                This module anchor-resets the VWAP at the precisely <strong>open of each candle</strong>.
                                We only compare the <strong>cumulative average</strong> of the live candle against the final cumulative average of the previous candle.
                                If the current AVWAP level is higher than the previous one, it indicates that the average entry price of all participants in
                                the current timeframe is trending upwards, providing a mathematical momentum confirmation.
                            </p>
                            <div className="pt-2 flex items-center gap-4 text-[10px] font-mono text-blue-400/60 font-bold uppercase">
                                <span>Anchor: {timeframe}m Interval Open</span>
                                <ArrowRight className="w-3 h-3" />
                                <span>No Repaint Execution</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
