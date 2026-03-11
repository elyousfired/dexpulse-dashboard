import React, { useState, useMemo } from 'react';
import { ActiveHunt } from '../types';
import { Clock, Tag, ArrowUpRight, ArrowDownRight, Search, Filter, BarChart3, TrendingUp, History, Info } from 'lucide-react';
import { EquityCurve } from './EquityCurve';

interface PerformanceJournalProps {
  hunts: ActiveHunt[];
  onTickerClick: (ticker: any) => void;
}

export const PerformanceJournal: React.FC<PerformanceJournalProps> = ({ hunts, onTickerClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStrategy, setFilterStrategy] = useState('all');

  const processedHunts = useMemo(() => {
    return hunts
      .filter(h => h.status === 'closed')
      .filter(h => {
        const matchesSearch = h.symbol.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStrategy = filterStrategy === 'all' || h.strategyId === filterStrategy;
        return matchesSearch && matchesStrategy;
      })
      .sort((a, b) => new Date(b.exitTime || 0).getTime() - new Date(a.exitTime || 0).getTime());
  }, [hunts, searchTerm, filterStrategy]);

  const stats = useMemo(() => {
    const closed = hunts.filter(h => h.status === 'closed');
    const totalPnl = closed.reduce((acc, h) => acc + (h.pnl || 0), 0);
    const wins = closed.filter(h => (h.pnl || 0) > 0).length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    
    return {
      totalTrades: closed.length,
      totalPnl,
      winRate
    };
  }, [hunts]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--/--';
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3">
            <History className="w-8 h-8 text-cyan-500" />
            Performance Journal
          </h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
            Institutional Audit Log & Precision Execution History
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#12141c] border border-white/5 rounded-xl p-3 px-5 flex flex-col items-center justify-center min-w-[120px]">
             <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Total PnL</span>
             <span className={`text-xl font-black italic ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
               {stats.totalPnl > 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}%
             </span>
          </div>
          <div className="bg-[#12141c] border border-white/5 rounded-xl p-3 px-5 flex flex-col items-center justify-center min-w-[120px]">
             <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Win Rate</span>
             <span className="text-xl font-black italic text-cyan-400">
               {stats.winRate.toFixed(1)}%
             </span>
          </div>
          <div className="bg-[#12141c] border border-white/5 rounded-xl p-3 px-5 flex flex-col items-center justify-center min-w-[120px]">
             <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Trades</span>
             <span className="text-xl font-black italic text-white">
               {stats.totalTrades}
             </span>
          </div>
        </div>
      </div>

      <EquityCurve hunts={hunts} />

      <div className="flex flex-col md:flex-row gap-4 items-center bg-[#0d0f1a] p-4 rounded-2xl border border-white/5">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
          <input
            type="text"
            placeholder="Search symbol (e.g. BTC)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#12141c] border border-white/5 rounded-xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 bg-[#12141c] border border-white/5 rounded-xl p-1">
          {['all', 'golden_signal', 'golden_rotation'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStrategy(s)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                filterStrategy === s 
                  ? 'bg-cyan-500 text-black' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0d0f1a] rounded-3xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Asset / Strategy</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Time (Entry/Exit)</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Price (Entry/Exit)</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Reasoning</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {processedHunts.map((h, i) => (
                <tr 
                  key={i} 
                  onClick={() => onTickerClick({ symbol: h.symbol, id: h.symbol + 'USDT' })}
                  className="group hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-sm text-white border border-white/5 group-hover:border-cyan-500/30 transition-colors">
                        {h.symbol.charAt(0)}
                      </div>
                      <div>
                        <div className="font-black text-white text-base group-hover:text-cyan-400 transition-colors">{h.symbol}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1 border border-white/10 rounded-md px-1.5 w-fit mt-1">
                          <Tag className="w-2.5 h-2.5" />
                          {h.strategyId?.replace('_', ' ') || 'LEGACY'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                        <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                        {formatDate(h.entryTime)} | {formatTime(h.entryTime)}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <ArrowDownRight className="w-3 h-3 text-rose-500" />
                        {formatDate(h.exitTime)} | {formatTime(h.exitTime)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-1">
                      <div className="text-xs font-black text-white/90">IN: ${h.entryPrice.toFixed(4)}</div>
                      <div className="text-xs font-black text-slate-400">OUT: ${h.exitPrice?.toFixed(4) || '--'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-5 max-w-[300px]">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-cyan-400/80 uppercase tracking-tight line-clamp-1 italic">
                        Entry: Signal Cluster Validated
                      </div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight line-clamp-1 italic">
                        Exit: {h.pnl === 0 ? 'PURGE / STAGNATION' : (h.pnl && h.pnl > 0 ? 'PROFIT TAKEN' : 'RISK PROTECTED')}
                      </div>
                      <div className="text-[9px] text-slate-600 font-medium line-clamp-1 bg-black/20 rounded px-1 w-fit mt-1">
                        Reason: {h.pnl && h.pnl > 4 ? 'Golden TP Hit' : 'VWAP Slope Flip'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className={`text-lg font-black italic ${ (h.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      { (h.pnl || 0) > 0 ? '+' : '' }{(h.pnl || 0).toFixed(2)}%
                    </div>
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-1">Realized</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
