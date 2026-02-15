
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker } from '../types';
import { fetchBinanceKlines } from '../services/cexService';
import { computeSACRotation, RotationSignal, SACResult } from '../services/rotationService';
import {
    Repeat, TrendingUp, TrendingDown, AlertTriangle, Zap, Target,
    ArrowRight, Shield, Loader2, RefreshCw, Coins, BarChart3, ArrowUpDown
} from 'lucide-react';

interface SwapPanelProps {
    tickers: CexTicker[];
}

const CANDIDATES = ['BTC', 'ETH', 'BNB', 'SOL'];

const CANDIDATE_COLORS: Record<string, string> = {
    BTC: '#f7931a',
    ETH: '#627eea',
    BNB: '#f3ba2f',
    SOL: '#9945ff'
};

interface Portfolio {
    USDT: number;
    BTC: number;
    ETH: number;
    BNB: number;
    SOL: number;
}

export const SwapPanel: React.FC<SwapPanelProps> = ({ tickers }) => {
    const [signal, setSignal] = useState<RotationSignal | null>(null);
    const [loading, setLoading] = useState(true);
    const [portfolio, setPortfolio] = useState<Portfolio>(() => {
        const saved = localStorage.getItem('dexpulse_portfolio');
        return saved ? JSON.parse(saved) : { USDT: 10000, BTC: 0, ETH: 0, BNB: 0, SOL: 0 };
    });

    // Swap state
    const [swapFrom, setSwapFrom] = useState('USDT');
    const [swapTo, setSwapTo] = useState('BTC');
    const [swapAmount, setSwapAmount] = useState('');

    // Persist portfolio
    useEffect(() => {
        localStorage.setItem('dexpulse_portfolio', JSON.stringify(portfolio));
    }, [portfolio]);

    // Compute SAC Scores
    const runAnalysis = useCallback(async () => {
        setLoading(true);
        try {
            const klinePromises = CANDIDATES.map(async (sym) => ({
                symbol: sym,
                klines: await fetchBinanceKlines(sym, '1d', 70)
            }));
            const candidates = await Promise.all(klinePromises);
            const result = await computeSACRotation(candidates);
            setSignal(result);
        } catch (err) {
            console.error('SAC Analysis error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { runAnalysis(); }, [runAnalysis]);

    // Get live price
    const getPrice = (sym: string): number => {
        if (sym === 'USDT') return 1;
        const t = tickers.find(t => t.symbol === sym);
        return t?.priceUsd || 0;
    };

    // Execute swap
    const executeSwap = () => {
        const amt = parseFloat(swapAmount);
        if (!amt || amt <= 0) return;

        const fromPrice = getPrice(swapFrom);
        const toPrice = getPrice(swapTo);
        if (fromPrice === 0 || toPrice === 0) return;

        const fromBalance = portfolio[swapFrom as keyof Portfolio];
        if (amt > fromBalance) return;

        const usdValue = amt * fromPrice;
        const toAmount = usdValue / toPrice;

        setPortfolio(prev => ({
            ...prev,
            [swapFrom]: prev[swapFrom as keyof Portfolio] - amt,
            [swapTo]: prev[swapTo as keyof Portfolio] + toAmount
        }));
        setSwapAmount('');
    };

    // Total portfolio value in USD
    const totalUsd = Object.entries(portfolio).reduce((sum, [sym, amount]) => {
        return sum + (amount as number) * getPrice(sym);
    }, 0);

    const getScoreColor = (score: number) => {
        if (score > 0.1) return 'text-emerald-400';
        if (score < -0.1) return 'text-rose-400';
        return 'text-gray-400';
    };

    const getScoreBar = (score: number, maxAbsScore: number) => {
        const normalized = maxAbsScore > 0 ? Math.abs(score) / maxAbsScore * 100 : 50;
        return Math.min(normalized, 100);
    };

    const maxAbsScore = signal ? Math.max(...signal.results.map(r => Math.abs(r.score))) : 1;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 border border-orange-500/30">
                        <Repeat className="w-8 h-8 text-orange-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">SAC Rotation Engine</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                            Strength Analysis Core · Maximize BTC/SOL Holdings
                        </p>
                    </div>
                </div>
                <button onClick={runAnalysis} disabled={loading} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 transition-all">
                    <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Signal Banner */}
            {signal && (
                <div className={`p-6 rounded-2xl border ${signal.shouldRotate ? 'bg-gradient-to-r from-emerald-900/30 via-[#0d0f14] to-rose-900/30 border-emerald-500/30' : 'bg-[#12141c] border-gray-800'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            {signal.shouldRotate ? (
                                <AlertTriangle className="w-10 h-10 text-yellow-400 animate-pulse" />
                            ) : (
                                <Shield className="w-10 h-10 text-gray-600" />
                            )}
                            <div>
                                <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Rotation Signal</div>
                                {signal.shouldRotate ? (
                                    <div className="flex items-center gap-3">
                                        <span className="text-rose-400 font-black text-lg uppercase">EXIT {signal.exit}</span>
                                        <ArrowRight className="w-5 h-5 text-yellow-500" />
                                        <span className="text-emerald-400 font-black text-lg uppercase">ENTER {signal.enter}</span>
                                    </div>
                                ) : (
                                    <span className="text-gray-500 font-bold text-sm">No rotation needed. Spread below threshold.</span>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Spread</div>
                            <div className={`text-xl font-black ${signal.shouldRotate ? 'text-yellow-400' : 'text-gray-600'}`}>
                                {signal.spread.toFixed(4)}
                            </div>
                            <div className="text-[9px] text-gray-600 font-bold">Threshold: 0.25</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* SAC Scoreboard */}
                <div className="xl:col-span-2 bg-[#12141c] rounded-2xl border border-gray-800 p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="w-4 h-4 text-orange-400" />
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">SAC Scoreboard (Daily)</h3>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                            <span className="ml-3 text-sm text-gray-500 font-bold">Computing SAC Scores...</span>
                        </div>
                    ) : signal ? (
                        <div className="space-y-4">
                            {[...signal.results].sort((a, b) => b.score - a.score).map((r, idx) => {
                                const ticker = tickers.find(t => t.symbol === r.symbol);
                                const change24h = ticker?.priceChangePercent24h || 0;
                                return (
                                    <div key={r.symbol} className={`p-4 rounded-xl border transition-all ${idx === 0 ? 'bg-emerald-500/5 border-emerald-500/20' :
                                            idx === signal.results.length - 1 ? 'bg-rose-500/5 border-rose-500/20' :
                                                'bg-black/40 border-gray-800'
                                        }`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm"
                                                    style={{ backgroundColor: `${CANDIDATE_COLORS[r.symbol]}20`, color: CANDIDATE_COLORS[r.symbol], border: `1px solid ${CANDIDATE_COLORS[r.symbol]}40` }}>
                                                    {r.symbol.charAt(0)}
                                                </div>
                                                <div>
                                                    <span className="text-white font-black text-sm">{r.symbol}/USDT</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-gray-500 font-bold">${ticker?.priceUsd?.toLocaleString() || '...'}</span>
                                                        <span className={`text-[10px] font-black ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-right">
                                                    <div className="text-[9px] text-gray-600 font-bold uppercase">SAC</div>
                                                    <div className={`text-sm font-black ${getScoreColor(r.sac)}`}>{r.sac.toFixed(4)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] text-gray-600 font-bold uppercase">Score</div>
                                                    <div className={`text-lg font-black ${getScoreColor(r.score)}`}>{r.score.toFixed(4)}</div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {idx === 0 && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-black rounded-full border border-emerald-500/30">ENTER</span>}
                                                    {idx === signal.results.length - 1 && <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[9px] font-black rounded-full border border-rose-500/30">EXIT</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Score bar */}
                                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-500 ${r.score > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                style={{ width: `${getScoreBar(r.score, maxAbsScore)}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>

                {/* Swap Interface + Portfolio */}
                <div className="space-y-6">
                    {/* Portfolio */}
                    <div className="bg-[#12141c] rounded-2xl border border-gray-800 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Coins className="w-4 h-4 text-yellow-500" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">Portfolio</h3>
                        </div>
                        <div className="text-2xl font-black text-white mb-4">${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        <div className="space-y-2">
                            {Object.entries(portfolio).map(([sym, amount]) => {
                                const val = (amount as number) * getPrice(sym);
                                const pct = totalUsd > 0 ? (val / totalUsd) * 100 : 0;
                                return (
                                    <div key={sym} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CANDIDATE_COLORS[sym] || '#8b8b8b' }}></div>
                                            <span className="text-gray-400 font-bold">{sym}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-white font-bold">{(amount as number).toFixed(sym === 'USDT' ? 2 : 6)}</span>
                                            <span className="text-gray-600 ml-2">({pct.toFixed(1)}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Swap UI */}
                    <div className="bg-[#12141c] rounded-2xl border border-gray-800 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <ArrowUpDown className="w-4 h-4 text-blue-400" />
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">Swap</h3>
                        </div>

                        {/* From */}
                        <div className="bg-black/60 rounded-xl p-4 border border-gray-800 mb-2">
                            <div className="text-[9px] text-gray-500 font-black uppercase mb-2">From</div>
                            <div className="flex items-center gap-3">
                                <select value={swapFrom} onChange={e => setSwapFrom(e.target.value)}
                                    className="bg-gray-800 text-white font-bold text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none">
                                    {['USDT', ...CANDIDATES].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={swapAmount}
                                    onChange={e => setSwapAmount(e.target.value)}
                                    className="flex-1 bg-transparent text-right text-white font-bold text-lg focus:outline-none"
                                />
                            </div>
                            <div className="text-[9px] text-gray-600 text-right mt-1 font-bold">
                                Balance: {portfolio[swapFrom as keyof Portfolio]?.toFixed(swapFrom === 'USDT' ? 2 : 6)}
                            </div>
                        </div>

                        {/* Arrow */}
                        <div className="flex justify-center -my-1 relative z-10">
                            <button onClick={() => { setSwapFrom(swapTo); setSwapTo(swapFrom); }}
                                className="p-2 bg-gray-800 rounded-full border border-gray-700 hover:bg-gray-700 transition-all">
                                <ArrowUpDown className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>

                        {/* To */}
                        <div className="bg-black/60 rounded-xl p-4 border border-gray-800 mt-2">
                            <div className="text-[9px] text-gray-500 font-black uppercase mb-2">To</div>
                            <div className="flex items-center gap-3">
                                <select value={swapTo} onChange={e => setSwapTo(e.target.value)}
                                    className="bg-gray-800 text-white font-bold text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none">
                                    {['USDT', ...CANDIDATES].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <div className="flex-1 text-right text-lg font-bold text-gray-500">
                                    {swapAmount && parseFloat(swapAmount) > 0
                                        ? ((parseFloat(swapAmount) * getPrice(swapFrom)) / getPrice(swapTo)).toFixed(swapTo === 'USDT' ? 2 : 6)
                                        : '0.00'
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Rate */}
                        {swapFrom !== swapTo && (
                            <div className="text-[9px] text-gray-600 text-center mt-3 font-bold">
                                1 {swapFrom} = {(getPrice(swapFrom) / getPrice(swapTo)).toFixed(swapTo === 'USDT' ? 2 : 8)} {swapTo}
                            </div>
                        )}

                        <button onClick={executeSwap}
                            disabled={!swapAmount || parseFloat(swapAmount) <= 0 || parseFloat(swapAmount) > portfolio[swapFrom as keyof Portfolio] || swapFrom === swapTo}
                            className="w-full mt-4 py-3 bg-gradient-to-r from-orange-600 to-purple-600 hover:from-orange-500 hover:to-purple-500 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xl shadow-orange-500/10">
                            Execute Swap
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
