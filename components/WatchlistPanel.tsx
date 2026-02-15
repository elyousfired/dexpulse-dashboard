
import React, { useMemo } from 'react';
import { CexTicker, WatchlistTrade } from '../types';
import { formatPrice } from '../services/cexService';
import { TrendingUp, TrendingDown, X, Clock, DollarSign, BarChart3, Trash2, Rocket } from 'lucide-react';

interface WatchlistPanelProps {
    trades: WatchlistTrade[];
    tickers: CexTicker[];
    onCloseTrade: (tradeId: string) => void;
    onRemoveTrade: (tradeId: string) => void;
    onTickerClick: (ticker: CexTicker) => void;
}

export const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
    trades,
    tickers,
    onCloseTrade,
    onRemoveTrade,
    onTickerClick
}) => {
    const activeTrades = useMemo(() => trades.filter(t => t.status === 'open'), [trades]);
    const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);

    const totalPnL = useMemo(() => {
        return activeTrades.reduce((acc, trade) => {
            const ticker = tickers.find(t => t.symbol === trade.symbol);
            if (!ticker) return acc;
            const currentPrice = ticker.priceUsd;
            const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.amount;
            return acc + pnl;
        }, 0) + closedTrades.reduce((acc, trade) => {
            const pnl = (((trade.closePrice || 0) - trade.entryPrice) / trade.entryPrice) * trade.amount;
            return acc + pnl;
        }, 0);
    }, [activeTrades, closedTrades, tickers]);

    const performanceColor = totalPnL >= 0 ? 'text-green-400' : 'text-rose-400';

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.05)] overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-blue-500/20 bg-gradient-to-r from-blue-900/10 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                        <BarChart3 className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">Paper Trading Sim</h2>
                        <p className="text-xs text-blue-400/60 font-medium font-mono lowercase">Real-time performance tracking from entry</p>
                    </div>
                </div>

                <div className="flex items-center gap-8">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-600 uppercase">Total Portfolio PnL</span>
                        <span className={`text-2xl font-black italic ${performanceColor}`}>
                            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTrades.length === 0 && closedTrades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                        <Rocket className="w-12 h-12 opacity-10 mb-4" />
                        <p>No active trades. Add a token from Decision AI or Market Grid to start simulating.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Active Trades */}
                        {activeTrades.length > 0 && (
                            <div>
                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Active Positions
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {activeTrades.map(trade => {
                                        const ticker = tickers.find(t => t.symbol === trade.symbol);
                                        const currentPrice = ticker?.priceUsd || trade.entryPrice;
                                        const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
                                        const pnlUsd = (pnlPercent / 100) * trade.amount;

                                        return (
                                            <div key={trade.id} className="bg-[#12141c] border border-gray-800 rounded-2xl p-4 hover:border-blue-500/30 transition-all">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white">
                                                            {trade.symbol[0]}
                                                        </div>
                                                        <span className="font-black text-white">{trade.symbol}/USDT</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => onCloseTrade(trade.id)}
                                                            className="px-3 py-1 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg text-[10px] font-black hover:bg-rose-500 hover:text-white transition-all"
                                                        >
                                                            CLOSE
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 mb-4">
                                                    <div>
                                                        <div className="text-[9px] font-black text-gray-600 uppercase mb-1">Entry Price</div>
                                                        <div className="text-sm font-mono font-bold text-gray-300">${formatPrice(trade.entryPrice)}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[9px] font-black text-gray-600 uppercase mb-1">Current Price</div>
                                                        <div className="text-sm font-mono font-bold text-white">${formatPrice(currentPrice)}</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-black text-gray-600 uppercase">Profit/Loss</span>
                                                        <span className={`text-lg font-black italic ${pnlPercent >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`text-sm font-black italic ${pnlUsd >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                                            {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-4 flex items-center justify-between text-[9px] text-gray-600 font-bold uppercase">
                                                    <span>In: ${trade.amount}</span>
                                                    <span>{new Date(trade.entryTime).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Closed Trades History */}
                        {closedTrades.length > 0 && (
                            <div>
                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Trade History</h3>
                                <div className="space-y-2">
                                    {closedTrades.map(trade => {
                                        const pnlPercent = (((trade.closePrice || 0) - trade.entryPrice) / trade.entryPrice) * 100;
                                        return (
                                            <div key={trade.id} className="flex items-center justify-between p-3 bg-black/20 border border-gray-900 rounded-xl">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs font-black text-white w-16">{trade.symbol}</span>
                                                    <span className="text-[10px] font-mono text-gray-500 italic">Entry: ${formatPrice(trade.entryPrice)}</span>
                                                    <span className="text-[10px] font-mono text-gray-500 italic">Exit: ${formatPrice(trade.closePrice || 0)}</span>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <span className={`text-xs font-black italic ${pnlPercent >= 0 ? 'text-green-500' : 'text-rose-500'}`}>
                                                        {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                                    </span>
                                                    <button
                                                        onClick={() => onRemoveTrade(trade.id)}
                                                        className="p-1.5 text-gray-700 hover:text-rose-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
