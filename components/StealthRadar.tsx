
import React, { useMemo } from 'react';
import { CexTicker, VwapData, BuySignal } from '../types';
import { formatPrice } from '../services/cexService';
import { Radar, Target, ShieldCheck, Star, ArrowRight, TrendingUp, Zap, MousePointer2 } from 'lucide-react';

interface StealthRadarProps {
    tickers: CexTicker[];
    vwapStore: Record<string, VwapData>;
    onTickerClick: (ticker: CexTicker) => void;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

export const StealthRadar: React.FC<StealthRadarProps> = ({
    tickers,
    vwapStore,
    onTickerClick,
    onAddToWatchlist
}) => {
    const stealthSignals = useMemo(() => {
        return tickers.map(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return null;

            const lastClose = vwap.last15mClose || t.priceUsd;

            // 1. Volatility Hurdle: MUST BE LOW (< 2%)
            const rangeDist = Math.abs(vwap.max - vwap.min);
            const volatility = (rangeDist / lastClose) * 100;
            const isLowVol = volatility < 2.0;

            // 2. Bullish Structure: Curr VWAP > Prev VWAP
            const prevV = vwap.prevWeekVwap || 0;
            const currV = vwap.currentWeekVwap || 0;
            const isBullishStructure = currV > prevV && prevV > 0;

            // 3. Price Support: Price > Current VWAP
            const isAboveSupport = lastClose > currV;

            if (isLowVol && isBullishStructure && isAboveSupport) {
                // Score calculation: Higher if Price is closer to VWAP (tighter consolidation)
                const distanceToVwap = ((lastClose - currV) / currV) * 100;
                const score = Math.max(70, 100 - (distanceToVwap * 10)); // Higher score for tighter proximity

                return {
                    ticker: t,
                    vwap,
                    score,
                    reason: `STEALTH ACCUMULATION: Institutional coiling detected. Price is stabilizing above Weekly VWAP ($${currV.toFixed(4)}) with ultra-low volatility (${volatility.toFixed(2)}%). High probability of explosive breakout.`,
                    type: 'STEALTH' as const
                };
            }
            return null;
        })
            .filter((s): s is (BuySignal & { type: 'STEALTH' }) => s !== null)
            .sort((a, b) => b.score - a.score);
    }, [tickers, vwapStore]);

    if (stealthSignals.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                <Radar className="w-12 h-12 opacity-10 mb-4 animate-pulse text-blue-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Scanning for Stealth Accumulation...</p>
                <p className="text-[9px] mt-2 opacity-50">Looking for tight volatility (&lt;2%) and institutional support.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {stealthSignals.map((sig) => (
                <button
                    key={sig.ticker.id}
                    onClick={() => onTickerClick(sig.ticker)}
                    className="group relative flex flex-col p-5 bg-[#0a0f1a] rounded-2xl border border-blue-500/10 hover:border-blue-500/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] active:scale-[0.99]"
                >
                    {/* Radar Animation Badge */}
                    <div className="absolute top-4 right-4 flex flex-col items-end">
                        <div className="relative flex items-center justify-center w-8 h-8">
                            <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                            <Radar className="w-4 h-4 text-blue-400 relative z-10" />
                        </div>
                        <div className="mt-2 text-[10px] font-black text-blue-400 uppercase tracking-tighter">
                            Coiling: {sig.score.toFixed(0)}%
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-black text-lg text-blue-400">
                            {sig.ticker.symbol[0]}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tighter">
                                {sig.ticker.symbol} / USDT
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-black uppercase border border-blue-500/20">
                                    STEALTH RADAR
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/10 mb-4">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-black text-blue-400/70 uppercase tracking-widest">Radar Analysis</span>
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed font-medium">
                            {sig.reason}
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Price</span>
                            <span className="text-sm font-mono font-bold text-white">${formatPrice(sig.ticker.priceUsd)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Weekly VWAP</span>
                            <span className="text-sm font-mono font-bold text-blue-400">${formatPrice(sig.vwap.currentWeekVwap || 0)}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Vol (7D)</span>
                            <span className="text-sm font-mono font-bold text-emerald-400">
                                {((Math.abs(sig.vwap.max - sig.vwap.min) / sig.ticker.priceUsd) * 100).toFixed(2)}%
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddToWatchlist(sig.ticker);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 text-blue-400 border border-blue-600/20 rounded-xl text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all"
                        >
                            <Star className="w-3 h-3" />
                            ADD TO WATCHLIST
                        </button>
                        <div className="flex items-center gap-1 text-blue-400 font-black text-xs group-hover:gap-2 transition-all uppercase">
                            View Radar <ArrowRight className="w-4 h-4" />
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
};
