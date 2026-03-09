
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker, VwapData, WatchlistTrade, ActiveHunt } from './types';
import { fetchCexTickers, initCexWebSocket, fetchWeeklyVwapData, fetchBinanceKlines } from './services/cexService';
import { buildVwapMetrics, classifyVwapTrend, analyzeVwapIntraday, runVwapScenarioEngine, VwapArchState } from './services/vwapArchService';
import { VwapArchPanel } from './components/VwapArchPanel';
import { DashboardHeader } from './components/DashboardHeader';
import { CexGrid } from './components/CexGrid';
import { CexDetailPanel } from './components/CexDetailPanel';
import { VwapScanner } from './components/VwapScanner';
import { DecisionBuyAi } from './components/DecisionBuyAi';
import { WatchlistPanel } from './components/WatchlistPanel';
import { WhaleScanner } from './components/WhaleScanner';
import { BtcCorrelation } from './components/BtcCorrelation';
import { TradingPlaybook } from './components/TradingPlaybook';
import { AntfarmSentiment } from './components/AntfarmSentiment';
import { SwapPanel } from './components/SwapPanel';
import { NewsFeed } from './components/NewsFeed';
import { VwapMultiTF } from './components/VwapMultiTF';
import { VwapAnchorBot } from './components/VwapAnchorBot';
import { EcosystemGrid } from './components/EcosystemGrid';
import { TokenChart } from './components/TokenChart';
import { MarketStructureDashboard } from './components/MarketStructureDashboard';
import { ArbitrageTerminal } from './components/ArbitrageTerminal';
import { StructureRadar } from './components/StructureRadar';
import { GlobalCompoundTerminal } from './components/GlobalCompoundTerminal';
import { Sidebar } from './components/Sidebar';
import { TmaPanel } from './components/TmaPanel';
import { calculateATR, calculatePDMetrics, classifyDay, calculateLiquidityZones, analyzeIntraday, runScenarioEngine, TmaState } from './services/tmaService';
import { Compass, Waves, Zap } from 'lucide-react';

// ─── TMA Architecture View ───────────────────────
const TmaView: React.FC<{
  selectedCexTicker: CexTicker | null;
  tmaState: TmaState | null;
  tmaLoading: boolean;
  setTmaState: (s: TmaState | null) => void;
  setTmaLoading: (b: boolean) => void;
}> = ({ selectedCexTicker, tmaState, tmaLoading, setTmaState, setTmaLoading }) => {
  const sym = selectedCexTicker?.symbol || 'BTC';
  const addr = selectedCexTicker?.id || 'BTCUSDT';

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      setTmaLoading(true);
      try {
        const [daily, klines15m] = await Promise.all([
          fetchBinanceKlines(addr, '1d', 30),
          fetchBinanceKlines(addr, '15m')
        ]);
        if (cancelled || daily.length < 2 || klines15m.length === 0) return;

        const yesterday = daily[daily.length - 2];
        const metrics = calculatePDMetrics(yesterday);
        const classification = classifyDay(metrics);
        const atr = calculateATR(daily);
        const latestPrice = klines15m[klines15m.length - 1].close;
        const zones = calculateLiquidityZones(metrics, latestPrice, atr);
        const intraday = analyzeIntraday(metrics, klines15m);
        const probabilities = runScenarioEngine(metrics, intraday, klines15m);

        setTmaState({
          metrics,
          classification,
          zones,
          liquidityTaken: intraday.liquidityTaken,
          current: intraday,
          probabilities
        });
      } catch (e) { console.error('TMA Arch error:', e); }
      finally { if (!cancelled) setTmaLoading(false); }
    };
    compute();
    const interval = setInterval(compute, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [addr]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3">
            <Compass className="w-8 h-8 text-blue-500" />
            TMA Architecture
          </h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Institutional Time-Market-Analysis & Liquidity Flow</p>
        </div>
        <div className="flex bg-[#12141c] rounded-xl p-1 border border-gray-800">
          <span className="px-4 py-1.5 text-xs font-black text-blue-400 uppercase tracking-widest">Target: {sym}</span>
        </div>
      </div>
      <div className="h-[750px] relative">
        <TokenChart address={addr} symbol={sym} isCex={true} activeView="price" hideTmaPanel={true} />
      </div>
      <div className="grid grid-cols-1 gap-6">
        <TmaPanel symbol={sym} state={tmaState} isLoading={tmaLoading} />
      </div>
    </div>
  );
};

// ─── VWAP Architecture View ───────────────────────
const VwapArchView: React.FC<{
  selectedCexTicker: CexTicker | null;
  vwapArchState: VwapArchState | null;
  vwapArchLoading: boolean;
  setVwapArchState: (s: VwapArchState | null) => void;
  setVwapArchLoading: (b: boolean) => void;
}> = ({ selectedCexTicker, vwapArchState, vwapArchLoading, setVwapArchState, setVwapArchLoading }) => {
  const sym = selectedCexTicker?.symbol || 'BTC';
  const addr = selectedCexTicker?.id || 'BTCUSDT';

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      setVwapArchLoading(true);
      try {
        const [weekly, klines15m] = await Promise.all([
          fetchWeeklyVwapData(addr),
          fetchBinanceKlines(addr, '15m')
        ]);
        if (cancelled || !weekly) return;
        const vwapMetrics = buildVwapMetrics(weekly);
        const vwapTrend = classifyVwapTrend(vwapMetrics);
        const vwapDetection = analyzeVwapIntraday(vwapMetrics, klines15m);
        const vwapProbs = runVwapScenarioEngine(vwapMetrics, vwapDetection, klines15m);

        let vwapBias: VwapArchState['current']['bias'] = 'Neutral';
        if (vwapProbs.reversal > 50) vwapBias = vwapDetection.mss === 'Long' ? 'Reversal Long' : 'Reversal Short';
        else if (vwapProbs.continuation > 50) vwapBias = vwapDetection.acceptance === 'Above W-Max' ? 'Bullish' : 'Bearish';

        setVwapArchState({
          metrics: vwapMetrics, trend: vwapTrend, liquidityTaken: vwapDetection.liquidityTaken,
          current: { ...vwapDetection, bias: vwapBias, confidence: Math.max(vwapProbs.reversal, vwapProbs.continuation, vwapProbs.range) },
          probabilities: vwapProbs
        });
      } catch (e) { console.error('VWAP Arch error:', e); }
      finally { if (!cancelled) setVwapArchLoading(false); }
    };
    compute();
    const interval = setInterval(compute, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [addr]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">VWAP Architecture</h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Weekly VWAP Structural Engine & Liquidity Sweep Detector</p>
        </div>
        <div className="flex bg-[#12141c] rounded-xl p-1 border border-gray-800">
          <span className="px-4 py-1.5 text-xs font-black text-cyan-400 uppercase tracking-widest">Active Ticker: {sym}</span>
        </div>
      </div>
      <div className="h-[750px] relative">
        <TokenChart address={addr} symbol={sym} isCex={true} activeView="price" hideTmaPanel={true} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VwapArchPanel symbol={sym} state={vwapArchState} isLoading={vwapArchLoading} />
      </div>
    </div>
  );
};

// ─── Main App Component ───────────────────────────
const App: React.FC = () => {
  const [cexTickers, setCexTickers] = useState<CexTicker[]>([]);
  const [cexLoading, setCexLoading] = useState(false);
  const [selectedCexTicker, setSelectedCexTicker] = useState<CexTicker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const tickersRef = React.useRef<CexTicker[]>([]);
  const updateBufferRef = React.useRef<CexTicker[]>([]);

  const [activeView, setActiveView] = useState<any>('grid');
  const [activeStrategy, setActiveStrategy] = useState('golden_signal');
  const [watchlist, setWatchlist] = useState<WatchlistTrade[]>(() => {
    const saved = localStorage.getItem('dex_cex_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
  const [firstSeenTimes, setFirstSeenTimes] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('dexpulse_first_seen_times');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [vwapLoading, setVwapLoading] = useState(false);
  const [activeHunts, setActiveHunts] = useState<ActiveHunt[]>([]);
  const [vwapArchState, setVwapArchState] = useState<VwapArchState | null>(null);
  const [vwapArchLoading, setVwapArchLoading] = useState(false);
  const [tmaState, setTmaState] = useState<TmaState | null>(null);
  const [tmaLoading, setTmaLoading] = useState(false);

  // ─── Global Cleanup ─────────────────────────────
  useEffect(() => {
    const hasReset = localStorage.getItem('dexpulse_global_reset_v7');
    if (!hasReset) {
      localStorage.setItem('dexpulse_global_reset_v7', 'true');
      setFirstSeenTimes({});
      setVwapStore({});
    }
  }, []);

  // ─── Consolidated Hunts Polling (5s) ───────────
  const fetchGlobalHunts = useCallback(async () => {
    try {
      const res = await fetch('/api/hunts');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setActiveHunts(data);
      }
    } catch (e) { console.error('Hunts error:', e); }
  }, []);

  useEffect(() => {
    fetchGlobalHunts();
    const interval = setInterval(fetchGlobalHunts, 5000);
    return () => clearInterval(interval);
  }, [fetchGlobalHunts]);

  // ─── CEX Data & WS Throttling (1s) ──────────────
  const loadCexData = useCallback(async () => {
    setCexLoading(true);
    try {
      const data = await fetchCexTickers();
      setCexTickers(data);
      tickersRef.current = data;
      setLastUpdated(new Date());
    } finally { setCexLoading(false); }
  }, []);

  useEffect(() => {
    loadCexData();
    const interval = setInterval(loadCexData, 60000);
    const throttleInterval = setInterval(() => {
      if (updateBufferRef.current.length === 0) return;
      setCexTickers((prev) => {
        const next = [...prev];
        updateBufferRef.current.forEach((upd) => {
          const idx = next.findIndex((t) => t.id === upd.id);
          if (idx !== -1) next[idx] = { ...next[idx], ...upd };
          else next.push(upd);
        });
        tickersRef.current = next;
        return next;
      });
      updateBufferRef.current = [];
      setLastUpdated(new Date());
    }, 1000);

    const cleanupWs = initCexWebSocket((updatedTickers) => {
      updateBufferRef.current = [...updateBufferRef.current, ...updatedTickers];
    });

    return () => { clearInterval(interval); clearInterval(throttleInterval); cleanupWs(); };
  }, [loadCexData]);

  // ─── Signal Engine ──────────────────────────────
  useEffect(() => {
    if (!['decision', 'anchoredVWAP', 'ecosystems', 'vwapArch'].includes(activeView)) return;
    let cancelled = false;
    const runScan = async () => {
      if (tickersRef.current.length === 0) { setTimeout(() => { if (!cancelled) runScan(); }, 3000); return; }
      setVwapLoading(true);
      const tickers = tickersRef.current.filter(t => t.volume24h > 500000).slice(0, 150);
      const newVwap = { ...vwapStore };
      const newFirstSeen = { ...firstSeenTimes };

      for (let i = 0; i < tickers.length; i += 5) {
        if (cancelled) break;
        const chunk = tickers.slice(i, i + 5);
        await Promise.all(chunk.map(async (t) => {
          try {
            const data = await fetchWeeklyVwapData(t.symbol);
            if (data) { newVwap[t.id] = data; if (!newFirstSeen[t.id]) newFirstSeen[t.id] = Date.now(); }
          } catch (e) { }
        }));
        if (!cancelled) { setVwapStore({ ...newVwap }); setFirstSeenTimes(newFirstSeen); }
        if (i + 5 < tickers.length) await new Promise(r => setTimeout(r, 600));
      }
      if (!cancelled) setVwapLoading(false);
    };
    runScan();
    return () => { cancelled = true; };
  }, [activeView === 'decision']);

  // ─── Watchlist Handlers ─────────────────────────
  const handleAddToWatchlist = (ticker: CexTicker) => {
    if (watchlist.some(t => t.symbol === ticker.symbol && t.status === 'open')) return;
    const next = [{ id: crypto.randomUUID(), symbol: ticker.symbol, entryPrice: ticker.priceUsd, entryTime: Date.now(), amount: 100, status: 'open' as const }, ...watchlist];
    setWatchlist(next);
    localStorage.setItem('dex_cex_watchlist', JSON.stringify(next));
  };

  const handleCloseTrade = (id: string) => {
    const next = watchlist.map(t => (t.id === id && t.status === 'open') ? { ...t, status: 'closed' as const, closePrice: cexTickers.find(x => x.symbol === t.symbol)?.priceUsd || t.entryPrice, closeTime: Date.now() } : t);
    setHoldings(next);
  };

  const setHoldings = (next: WatchlistTrade[]) => {
    setWatchlist(next);
    localStorage.setItem('dex_cex_watchlist', JSON.stringify(next));
  };

  return (
    <div className="min-h-screen bg-[#06080c] text-white selection:bg-blue-500/30 flex">
      <Sidebar activeStrategy={activeStrategy} onSelectStrategy={setActiveStrategy} activeHunts={activeHunts} />

      <main className="flex-1 min-w-0 overflow-y-auto bg-slate-950/20 custom-scrollbar">
        <DashboardHeader activeView={activeView} onViewChange={setActiveView} searchTerm={searchTerm} onSearchChange={setSearchTerm} lastUpdated={lastUpdated} isScanning={cexLoading} activeStrategy={activeStrategy} onStrategyChange={setActiveStrategy} />

        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
          {activeView === 'grid' && <CexGrid tickers={cexTickers} loading={cexLoading} onRefresh={loadCexData} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'scanner' && <VwapScanner tickers={cexTickers} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'whale' && <WhaleScanner tickers={cexTickers} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'correlation' && <BtcCorrelation tickers={cexTickers} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'decision' && <DecisionBuyAi tickers={cexTickers} vwapStore={vwapStore} firstSeenTimes={firstSeenTimes} isLoading={vwapLoading} onTickerClick={setSelectedCexTicker} onAddToWatchlist={handleAddToWatchlist} />}
          {activeView === 'compound' && <GlobalCompoundTerminal huntsData={activeHunts} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'strategy_page' && <GlobalCompoundTerminal strategyId={activeStrategy} huntsData={activeHunts} title={activeStrategy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Hub'} subtitle={`Dedicated Real-Time Execution for ${activeStrategy}`} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'playbook' && <TradingPlaybook />}
          {activeView === 'sentiment' && <AntfarmSentiment tickers={cexTickers} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'swap' && <SwapPanel tickers={cexTickers} />}
          {activeView === 'news' && <NewsFeed />}
          {activeView === 'vwapMulti' && <VwapMultiTF tickers={cexTickers} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'anchoredVWAP' && <VwapAnchorBot tickers={cexTickers} vwapStore={vwapStore} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'ecosystems' && <EcosystemGrid tickers={cexTickers} vwapStore={vwapStore} onTickerClick={setSelectedCexTicker} />}
          {activeView === 'tma' && <TmaView selectedCexTicker={selectedCexTicker} tmaState={tmaState} tmaLoading={tmaLoading} setTmaState={setTmaState} setTmaLoading={setTmaLoading} />}
          {activeView === 'vwapArch' && <VwapArchView selectedCexTicker={selectedCexTicker} vwapArchState={vwapArchState} vwapArchLoading={vwapArchLoading} setVwapArchState={setVwapArchState} setVwapArchLoading={setVwapArchLoading} />}
          {activeView === 'structure' && <MarketStructureDashboard />}
          {activeView === 'arbitrage' && <ArbitrageTerminal tickers={cexTickers} />}
          {(activeView === 'watchlist' || !activeView) && <WatchlistPanel trades={watchlist} tickers={cexTickers} onCloseTrade={handleCloseTrade} onRemoveTrade={(id) => setHoldings(watchlist.filter(t => t.id !== id))} onTickerClick={setSelectedCexTicker} />}
        </div>
      </main>

      {selectedCexTicker && <CexDetailPanel ticker={selectedCexTicker} onClose={() => setSelectedCexTicker(null)} onAddToWatchlist={handleAddToWatchlist} />}
    </div>
  );
};

export default App;
