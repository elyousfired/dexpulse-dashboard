
import React, { useMemo } from 'react';
import { CexTicker } from '../types';
import { formatPrice } from '../services/cexService';
import { Link, ShieldAlert, TrendingUp, TrendingDown, Zap, BarChart3, Activity, ArrowRight } from 'lucide-react';

interface BtcCorrelationProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

interface CorrelationResult {
    ticker: CexTicker;
    relPerformance: number; // Token % - BTC %
    category: 'HEDGE' | 'ALPHA' | 'LAGGARD';
    strength: number;
}

export const BtcCorrelation: React.FC<BtcCorrelationProps> = ({ tickers, onTickerClick }) => {
    const btc = useMemo(() => tickers.find(t => t.symbol === 'BTC'), [tickers]);

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

                return { ticker: t, relPerformance, category, strength };
            })
            .sort((a, b) => b.relPerformance - a.relPerformance);
    }, [tickers, btc]);

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

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Hedges Section (Strong when BTC weak) */}
                    <div>
                        <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4" /> BTC Hedges (Negative Correlation)
                        </h3>
                        <div className="space-y-3">
                            {results.filter(r => r.category === 'HEDGE').slice(0, 10).map(res => (
                                <button
                                    key={res.ticker.id}
                                    onClick={() => onTickerClick(res.ticker)}
                                    className="w-full group flex items-center justify-between p-4 bg-[#12141c] border border-gray-800 rounded-2xl hover:border-rose-500/50 transition-all"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black text-white">
                                            {res.ticker.symbol[0]}
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-black text-white">{res.ticker.symbol}/USDT</div>
                                            <div className="text-[10px] font-bold text-gray-600 uppercase">Strong decoupled strength</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-green-400">+{res.ticker.priceChangePercent24h.toFixed(2)}%</div>
                                        <div className="text-[10px] font-black text-rose-500">Outperforms BTC: {res.relPerformance.toFixed(1)}%</div>
                                    </div>
                                </button>
                            ))}
                            {results.filter(r => r.category === 'HEDGE').length === 0 && (
                                <div className="p-10 text-center text-gray-700 text-xs italic border border-dashed border-gray-800 rounded-2xl">
                                    No tokens currently decoupled from BTC drop.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Alpha Section (Leading the pump) */}
                    <div>
                        <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4" /> Alpha Leaders (High Beta)
                        </h3>
                        <div className="space-y-3">
                            {results.filter(r => r.category === 'ALPHA').slice(0, 10).map(res => (
                                <button
                                    key={res.ticker.id}
                                    onClick={() => onTickerClick(res.ticker)}
                                    className="w-full group flex items-center justify-between p-4 bg-[#12141c] border border-gray-800 rounded-2xl hover:border-emerald-500/50 transition-all"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center font-black text-white">
                                            {res.ticker.symbol[0]}
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-black text-white">{res.ticker.symbol}/USDT</div>
                                            <div className="text-[10px] font-bold text-gray-600 uppercase">High correlation leverage</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-emerald-400">+{res.ticker.priceChangePercent24h.toFixed(2)}%</div>
                                        <div className="text-[10px] font-black text-emerald-600">Alpha over BTC: +{res.relPerformance.toFixed(1)}%</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className={`p-4 border-t flex items-center gap-3 ${btcIsDown ? 'bg-rose-900/5 border-rose-500/10' : 'bg-emerald-900/5 border-emerald-500/10'}`}>
                <Activity className={`w-4 h-4 ${btcIsDown ? 'text-rose-400' : 'text-emerald-400'}`} />
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                    Real-time delta tracking against BTCUSDT benchmarks.
                </span>
            </div>
        </div>
    );
};
