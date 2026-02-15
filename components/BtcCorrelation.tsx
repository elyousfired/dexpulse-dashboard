
import React, { useMemo } from 'react';
import { CexTicker } from '../types';
import { formatPrice, calculateHistoricalCorrelation, CorrelationStats, fetchBinanceKlines } from '../services/cexService';
import { Link, ShieldAlert, TrendingUp, TrendingDown, Zap, BarChart3, Activity, ArrowRight, Star, History, Loader2 } from 'lucide-react';

interface BtcCorrelationProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

interface CorrelationResult {
    ticker: CexTicker;
    relPerformance: number; // Token % - BTC %
    category: 'HEDGE' | 'ALPHA' | 'LAGGARD';
    strength: number;
    histStats?: CorrelationStats;
}

export const BtcCorrelation: React.FC<BtcCorrelationProps> = ({ tickers, onTickerClick }) => {
    const [historicalStats, setHistoricalStats] = React.useState<Record<string, CorrelationStats>>({});
    const [isAnalyzing, setIsAnalyzing] = React.useState(true);

    const btc = useMemo(() => tickers.find(t => t.symbol === 'BTC'), [tickers]);

    React.useEffect(() => {
        if (tickers.length === 0) return;

        const analyzeHistory = async () => {
            console.log('Starting historical correlation analysis for', tickers.length, 'tickers');
            setIsAnalyzing(true);
            const stats: Record<string, CorrelationStats> = {};

            try {
                // Fetch BTC Klines ONCE
                const btcKlines = await fetchBinanceKlines('BTC', '1d', 14);
                if (btcKlines.length === 0) {
                    console.error('Failed to fetch BTC klines');
                    setIsAnalyzing(false);
                    return;
                }

                // Analyze top 50 tickers by volume
                const targets = tickers.filter(t => t.symbol !== 'BTC').slice(0, 50);

                for (let i = 0; i < targets.length; i += 10) {
                    const chunk = targets.slice(i, i + 10);
                    await Promise.all(chunk.map(async (t) => {
                        const res = await calculateHistoricalCorrelation(t.symbol, btcKlines);
                        if (res) stats[t.id] = res;
                    }));
                }
                console.log('Historical analysis complete. Results:', Object.keys(stats).length);
                setHistoricalStats(stats);
            } catch (err) {
                console.error('Analysis error:', err);
            } finally {
                setIsAnalyzing(false);
            }
        };
        analyzeHistory();
    }, [tickers.length > 0 ? 1 : 0]); // Trigger when tickers load for the first time

    const results = useMemo(() => {
        if (!btc) return [];

        const btcChange = btc.priceChangePercent24h;

        return tickers
            .filter(t => t.symbol !== 'BTC' && t.exchange === 'Binance')
            .map(t => {
                const tokenChange = t.priceChangePercent24h;
                const relPerformance = tokenChange - btcChange;

                let category: CorrelationResult['category'] = 'LAGGARD';
                let strength = 0;

                // 1. HEDGE: BTC is down, Token is up
                if (btcChange < 0 && tokenChange > 0) {
                    category = 'HEDGE';
                    strength = Math.min(100, Math.abs(relPerformance) * 10);
                }
                // 2. ALPHA: Token is significantly outperforming BTC (both up or token up more)
                else if (tokenChange > btcChange && tokenChange > 2) {
                    category = 'ALPHA';
                    strength = Math.min(100, relPerformance * 5);
                }
                // 3. LAGGARD: Token is underperforming BTC
                else {
                    category = 'LAGGARD';
                    strength = Math.min(100, Math.abs(relPerformance) * 5);
                }

                return {
                    ticker: t,
                    relPerformance,
                    category,
                    strength,
                    histStats: historicalStats[t.id]
                };
            })
            .sort((a, b) => b.relPerformance - a.relPerformance);
    }, [tickers, btc, historicalStats]);

    if (!btc) return (
        <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
            <Activity className="w-12 h-12 text-blue-500 animate-pulse" />
            <p className="text-sm font-black tracking-widest uppercase">Waiting for BTC Price Feed...</p>
        </div>
    );

    const btcIsDown = btc.priceChangePercent24h < 0;

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-blue-500/10 shadow-2xl overflow-hidden">
            {/* Correlation Header */}
            <div className={`p-6 border-b flex items-center justify-between transition-colors duration-500 ${btcIsDown ? 'bg-rose-900/10 border-rose-500/20' : 'bg-emerald-900/10 border-emerald-500/20'}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl border ${btcIsDown ? 'bg-rose-500/20 border-rose-500/30' : 'bg-emerald-500/20 border-emerald-500/30'}`}>
                        <Link className={`w-8 h-8 ${btcIsDown ? 'text-rose-400' : 'text-emerald-400'}`} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">BTC Correlation Guard</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">BTC Stat:</span>
                            <span className={`text-xs font-mono font-black ${btcIsDown ? 'text-rose-400' : 'text-emerald-400'}`}>
                                ${formatPrice(btc.priceUsd)} ({btc.priceChangePercent24h >= 0 ? '+' : ''}{btc.priceChangePercent24h.toFixed(2)}%)
                            </span>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex gap-4">
                    <div className="px-4 py-2 bg-black/40 rounded-xl border border-white/5 flex flex-col items-end">
                        <span className="text-[9px] font-black text-gray-600 uppercase">Market Sentiment</span>
                        <span className={`text-sm font-black ${btcIsDown ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {btcIsDown ? 'RISK-OFF / HEDGING' : 'RISK-ON / ALPHA SEARCH'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-12">
                {/* ─── SECTION 1: ACTIVE 24H POWER ──────────────────────── */}
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <Activity className="w-5 h-5 text-blue-500" />
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.3em]">Active 24h Signals</h3>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-blue-500/20 to-transparent"></div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Hedges Section (Strong when BTC weak) */}
                        <div>
                            <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-2">
                                <ShieldAlert className="w-4 h-4" /> BTC Hedges (Negative Delta)
                            </h3>
                            <div className="space-y-3">
                                {results.filter(r => r.category === 'HEDGE').slice(0, 5).map(res => (
                                    <button
                                        key={res.ticker.id}
                                        onClick={() => onTickerClick(res.ticker)}
                                        className="w-full group flex items-center justify-between p-4 bg-[#12141c] border border-gray-800 rounded-2xl hover:border-rose-500/50 transition-all shadow-lg hover:shadow-rose-500/5"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black text-white shadow-[0_4px_10px_rgba(225,29,72,0.3)]">
                                                {res.ticker.symbol[0]}
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-black text-white tracking-tight">{res.ticker.symbol}/USDT</div>
                                                <div className="text-[10px] font-bold text-gray-600 uppercase">Strong decoupled strength</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-green-400">+{res.ticker.priceChangePercent24h.toFixed(2)}%</div>
                                            <div className="text-[10px] font-black text-rose-500">Rel. Perf: +{res.relPerformance.toFixed(1)}%</div>
                                        </div>
                                    </button>
                                ))}
                                {results.filter(r => r.category === 'HEDGE').length === 0 && (
                                    <div className="p-8 text-center text-gray-700 text-[10px] font-bold uppercase tracking-widest border border-dashed border-gray-800/50 rounded-2xl">
                                        No active hedges detected.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Alpha Section (Leading the pump) */}
                        <div>
                            <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-2">
                                <Zap className="w-4 h-4" /> Alpha Leaders (High Beta)
                            </h3>
                            <div className="space-y-3">
                                {results.filter(r => r.category === 'ALPHA').slice(0, 5).map(res => (
                                    <button
                                        key={res.ticker.id}
                                        onClick={() => onTickerClick(res.ticker)}
                                        className="w-full group flex items-center justify-between p-4 bg-[#12141c] border border-gray-800 rounded-2xl hover:border-emerald-500/50 transition-all shadow-lg hover:shadow-emerald-500/5"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center font-black text-white shadow-[0_4px_10px_rgba(5,150,105,0.3)]">
                                                {res.ticker.symbol[0]}
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-black text-white tracking-tight">{res.ticker.symbol}/USDT</div>
                                                <div className="text-[10px] font-bold text-gray-600 uppercase">High correlation leverage</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-emerald-400">+{res.ticker.priceChangePercent24h.toFixed(2)}%</div>
                                            <div className="text-[10px] font-black text-emerald-600">Pure Alpha: +{res.relPerformance.toFixed(1)}%</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── SECTION 2: HISTORICAL CHAMPIONS (14D) ────────────────── */}
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <History className="w-5 h-5 text-indigo-500" />
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.3em]">Historical Consistency (14D)</h3>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-indigo-500/20 to-transparent"></div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Historical Hedges (Consistent decoupled tokens) */}
                        <div>
                            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-2">
                                <ShieldAlert className="w-4 h-4" /> Hedge Masters (Safe Havens)
                            </h3>
                            <div className="space-y-3">
                                {results
                                    .filter(r => r.histStats && r.histStats.hedgeScore > 30)
                                    .sort((a, b) => (b.histStats?.hedgeScore || 0) - (a.histStats?.hedgeScore || 0))
                                    .slice(0, 5)
                                    .map(res => (
                                        <button
                                            key={res.ticker.id}
                                            onClick={() => onTickerClick(res.ticker)}
                                            className="w-full group flex items-center justify-between p-4 bg-[#12141c]/50 border border-indigo-500/10 rounded-2xl hover:border-indigo-500/40 transition-all"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-indigo-900/40 border border-indigo-500/20 rounded-xl flex items-center justify-center font-black text-indigo-400 uppercase">
                                                    {res.ticker.symbol[0]}
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-sm font-black text-white">{res.ticker.symbol}/USDT</div>
                                                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">Pumps on BTC drops</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-black text-blue-400 uppercase tracking-tighter">
                                                    {res.histStats?.hedgeScore.toFixed(0)}% Consistency
                                                </div>
                                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                                    <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{ width: `${res.histStats?.hedgeScore}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                {isAnalyzing && (
                                    <div className="p-8 text-center text-gray-600 flex flex-col items-center gap-2 bg-black/20 rounded-2xl border border-dashed border-gray-800">
                                        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Scanning blockchain history...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Historical Followers (Alpha Kings) */}
                        <div>
                            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-2">
                                <Star className="w-4 h-4" /> Alpha Kings (Consistent Beta)
                            </h3>
                            <div className="space-y-3">
                                {results
                                    .filter(r => r.histStats && r.histStats.followerScore > 50)
                                    .sort((a, b) => (b.histStats?.followerScore || 0) - (a.histStats?.followerScore || 0))
                                    .slice(0, 5)
                                    .map(res => (
                                        <button
                                            key={res.ticker.id}
                                            onClick={() => onTickerClick(res.ticker)}
                                            className="w-full group flex items-center justify-between p-4 bg-[#12141c]/50 border border-amber-500/10 rounded-2xl hover:border-amber-500/40 transition-all"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-amber-900/40 border border-amber-500/20 rounded-xl flex items-center justify-center font-black text-amber-400 uppercase">
                                                    {res.ticker.symbol[0]}
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-sm font-black text-white">{res.ticker.symbol}/USDT</div>
                                                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">Consistent BTC Mirror</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-black text-amber-500 uppercase tracking-tighter">
                                                    {res.histStats?.followerScore.toFixed(0)}% Mirroring
                                                </div>
                                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                                    <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-amber-500" style={{ width: `${res.histStats?.followerScore}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className={`p-4 border-t flex items-center justify-between ${btcIsDown ? 'bg-rose-900/5 border-rose-500/10' : 'bg-emerald-900/5 border-emerald-500/10'}`}>
                <div className="flex items-center gap-3">
                    <Activity className={`w-4 h-4 ${btcIsDown ? 'text-rose-400' : 'text-emerald-400'}`} />
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                        Hybrid Analysis: Real-time Delta + 14-Day Structural Correlation
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isAnalyzing ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    <span className="text-[9px] font-black text-gray-500 uppercase">AI Guard Status: Active</span>
                </div>
            </div>
        </div>
    );
};
