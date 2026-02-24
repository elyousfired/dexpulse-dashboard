
import React, { useState, useEffect, useMemo } from 'react';
import { CexTicker } from '../types';
import {
    ARB_TOKEN_MAP,
    fetchJupiterPrice,
    calculateNetProfit,
    DEFAULT_FEES,
    ArbitrageOpportunity
} from '../services/arbitrageService';
import {
    Zap,
    ArrowRightLeft,
    TrendingUp,
    ShieldCheck,
    AlertCircle,
    ArrowUpRight,
    Loader2,
    RefreshCw,
    ExternalLink,
    Wallet,
    TowerControl as Control
} from 'lucide-react';

interface ArbitrageTerminalProps {
    tickers: CexTicker[];
}

export const ArbitrageTerminal: React.FC<ArbitrageTerminalProps> = ({ tickers }) => {
    const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastScan, setLastScan] = useState<Date>(new Date());

    const scanArbitrage = async () => {
        setLoading(true);
        const results: ArbitrageOpportunity[] = [];

        // Filter tickers that exist in our mapping
        const solanaTickers = tickers.filter(t => ARB_TOKEN_MAP[t.symbol]);

        const BATCH_SIZE = 5;
        for (let i = 0; i < solanaTickers.length; i += BATCH_SIZE) {
            const batch = solanaTickers.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (ticker) => {
                const mint = ARB_TOKEN_MAP[ticker.symbol];
                const jupPrice = await fetchJupiterPrice(mint);

                if (jupPrice) {
                    const binancePrice = ticker.priceUsd;
                    const gap = ((jupPrice - binancePrice) / binancePrice) * 100;

                    // Calculate net profit for a standard size ($1000)
                    const { netProfitPct } = calculateNetProfit(binancePrice, jupPrice, 1000);

                    results.push({
                        symbol: ticker.symbol,
                        mint,
                        binancePrice,
                        jupiterPrice: jupPrice,
                        gap,
                        netProfit: netProfitPct,
                        capacity: 1000, // Simplified for now
                        status: netProfitPct > 0.5 ? 'hot' : netProfitPct > 0 ? 'stable' : 'thin',
                        lastUpdated: Date.now()
                    });
                }
            }));
        }

        setOpportunities(results.sort((a, b) => b.netProfit - a.netProfit));
        setLoading(false);
        setLastScan(new Date());
    };

    useEffect(() => {
        scanArbitrage();
        const interval = setInterval(scanArbitrage, 30000); // Scan every 30s
        return () => clearInterval(interval);
    }, [tickers.length > 0]);

    const hotSignals = useMemo(() => opportunities.filter(o => o.netProfit > 0.5), [opportunities]);

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-orange-500/10 shadow-3xl overflow-hidden">
            {/* Nexus Header */}
            <div className="p-6 border-b border-orange-500/20 bg-gradient-to-r from-orange-900/10 via-transparent to-purple-900/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500/20 rounded-2xl border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                        <Control className="w-8 h-8 text-orange-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic flex items-center gap-2">
                            Nexus Hunter
                            <span className="px-2 py-0.5 rounded text-[9px] bg-orange-500/20 text-orange-400 border border-orange-500/30">BINANCE ↔ JUPITER</span>
                        </h2>
                        <p className="text-xs text-orange-400/60 font-medium font-mono uppercase tracking-widest">Cross-Exchange Arbitrage Terminal</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Live Signals</div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-lg font-black text-white">{hotSignals.length} GAPS FOUND</span>
                        </div>
                    </div>
                    <button
                        onClick={scanArbitrage}
                        disabled={loading}
                        className="p-3 bg-gray-900 hover:bg-gray-800 rounded-xl border border-gray-800 transition-all active:scale-95"
                    >
                        {loading ? <Loader2 className="w-5 h-5 text-orange-400 animate-spin" /> : <RefreshCw className="w-5 h-5 text-gray-400" />}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                {loading && opportunities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-4">
                        <Zap className="w-12 h-12 text-orange-500 animate-pulse" />
                        <p className="text-sm font-black tracking-widest uppercase">Scanning Global Liquidity Gaps...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {opportunities.map((opt) => (
                            <div
                                key={opt.symbol}
                                className={`relative group p-6 bg-[#12141c] border rounded-2xl transition-all duration-300 ${opt.netProfit > 0.5
                                        ? 'border-orange-500/40 bg-orange-500/[0.03] shadow-[0_0_40px_rgba(249,115,22,0.05)]'
                                        : 'border-gray-800'
                                    }`}
                            >
                                {/* Background Glow for Hot Gaps */}
                                {opt.netProfit > 0.5 && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-none animate-pulse" />
                                )}

                                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                    {/* Asset Info */}
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center font-black text-xl text-white border border-gray-700">
                                            {opt.symbol[0]}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-black text-white">{opt.symbol}</h3>
                                                {opt.netProfit > 0.5 && (
                                                    <span className="px-2 py-0.5 rounded text-[8px] bg-emerald-500 text-white font-black animate-bounce shadow-[0_0_10px_rgba(16,185,129,0.5)]">PROFIT READY</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-gray-500 font-mono">{opt.mint.slice(0, 6)}...{opt.mint.slice(-4)}</span>
                                                <ExternalLink className="w-2.5 h-2.5 text-gray-600" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Compare Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 flex-1 max-w-2xl px-6 border-l border-white/5">
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Binance CEX</div>
                                            <div className="text-base font-mono font-bold text-white">${opt.binancePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            <div className="text-[9px] text-gray-600 font-bold uppercase italic">No Withdrawal Lag</div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Jupiter DEX</div>
                                            <div className="text-base font-mono font-bold text-orange-400">${opt.jupiterPrice.toLocaleString(undefined, { minimumFractionDigits: 4 })}</div>
                                            <div className="text-[9px] text-gray-600 font-bold uppercase italic">Live Quote API</div>
                                        </div>

                                        <div className="space-y-1 hidden md:block">
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Raw Spread</div>
                                            <div className={`text-base font-mono font-black ${opt.gap > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                                                {opt.gap > 0 ? '+' : ''}{opt.gap.toFixed(2)}%
                                            </div>
                                            <div className="text-[9px] text-gray-600 font-bold uppercase italic">Before Fees</div>
                                        </div>
                                    </div>

                                    {/* Profit Verdict */}
                                    <div className="flex items-center gap-6">
                                        <div className="text-right border-r border-white/5 pr-6">
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Net Profit (1k)</div>
                                            <div className={`text-2xl font-black font-mono flex items-center gap-2 ${opt.netProfit > 0.5 ? 'text-emerald-400' : opt.netProfit > 0 ? 'text-yellow-400' : 'text-rose-500'}`}>
                                                {opt.netProfit > 0 ? '+' : ''}{opt.netProfit.toFixed(2)}%
                                                {opt.netProfit > 0.5 && <TrendingUp className="w-5 h-5" />}
                                            </div>
                                            <div className="text-[10px] text-gray-600 font-bold">FEES & SLIPPAGE INCL.</div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <a
                                                href={`https://jup.ag/swap/USDC-${opt.symbol}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-tighter transition-all active:scale-95 ${opt.netProfit > 0.5
                                                        ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                    }`}
                                            >
                                                Execute Arb
                                                <Zap className={`w-3.5 h-3.5 ${opt.netProfit > 0.5 ? 'animate-pulse' : ''}`} />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer Insights */}
            <div className="p-4 bg-orange-500/5 border-t border-orange-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">
                        Net Profit accounts for 0.1% Binance Fee, $0.05 SOL Gas, and 0.3% Jup LP Fee.
                    </span>
                </div>
                <div className="text-[9px] text-gray-600 font-bold uppercase italic">
                    Last Global Sync: {lastScan.toLocaleTimeString()}
                </div>
            </div>
        </div>
    );
};
