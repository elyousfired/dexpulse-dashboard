
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker, VwapData, WatchlistTrade } from './types';
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

// ─── VWAP Architecture View (Chart + VWAP Indicator) ──────
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
          fetchWeeklyVwapData(addr.replace('USDT', '') + 'USDT' === addr ? addr : addr),
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
          metrics: vwapMetrics,
          trend: vwapTrend,
          liquidityTaken: vwapDetection.liquidityTaken,
          current: {
            ...vwapDetection,
            bias: vwapBias,
            confidence: Math.max(vwapProbs.reversal, vwapProbs.continuation, vwapProbs.range)
          },
          probabilities: vwapProbs
        });
      } catch (e) {
        console.error('VWAP Arch error:', e);
      } finally {
        if (!cancelled) setVwapArchLoading(false);
      }
    };
    compute();
    const interval = setInterval(compute, 60000); // refresh every minute
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
        <TokenChart
          address={addr}
          symbol={sym}
          isCex={true}
          activeView="price"
        />
      </div>
      {/* VWAP Architecture Indicator (Always Visible) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VwapArchPanel symbol={sym} state={vwapArchState} isLoading={vwapArchLoading} />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // ─── CEX State (Primary) ────────────────────────
  const [cexTickers, setCexTickers] = useState<CexTicker[]>([]);
  const [cexLoading, setCexLoading] = useState(false);
  const [selectedCexTicker, setSelectedCexTicker] = useState<CexTicker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeView, setActiveView] = useState<'grid' | 'scanner' | 'decision' | 'watchlist' | 'whale' | 'correlation' | 'playbook' | 'sentiment' | 'swap' | 'news' | 'vwapMulti' | 'anchoredVWAP' | 'ecosystems' | 'tma' | 'vwapArch'>('grid');
  const [watchlist, setWatchlist] = useState<WatchlistTrade[]>(() => {
    const saved = localStorage.getItem('dex_cex_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  // ─── AI Signal Engine State ─────────────────────
  const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
  const [firstSeenTimes, setFirstSeenTimes] = useState<Record<string, number>>({});
  const [vwapLoading, setVwapLoading] = useState(false);

  // ─── VWAP Architecture State ────────────────────
  const [vwapArchState, setVwapArchState] = useState<VwapArchState | null>(null);
  const [vwapArchLoading, setVwapArchLoading] = useState(false);

  // ─── Initial Data Fetch ─────────────────────────
  const loadCexData = useCallback(async () => {
    setCexLoading(true);
    try {
      const data = await fetchCexTickers();
      setCexTickers(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load CEX tickers', err);
    } finally {
      setCexLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCexData();
    const interval = setInterval(loadCexData, 60000);
    const cleanupWs = initCexWebSocket((updatedTickers) => {
      setCexTickers((prev) => {
        const next = [...prev];
        updatedTickers.forEach((upd) => {
          const idx = next.findIndex((t) => t.id === upd.id);
          if (idx !== -1) {
            next[idx] = { ...next[idx], ...upd };
          } else {
            next.push(upd);
          }
        });
        return next;
      });
    });

    return () => {
      clearInterval(interval);
      cleanupWs();
    };
  }, [loadCexData]);

  // ─── VWAP Signal Polling ────────────────────────
  useEffect(() => {
    if (activeView !== 'decision' && activeView !== 'anchoredVWAP' && activeView !== 'ecosystems') return;

    const mainTickers = cexTickers.filter(t => t.volume24h > 1000000).slice(0, 150);

    const fetchSignals = async () => {
      setVwapLoading(true);
      const newVwapStore: Record<string, VwapData> = { ...vwapStore };
      const newFirstSeen: Record<string, number> = { ...firstSeenTimes };

      for (const t of mainTickers) {
        try {
          const data = await fetchWeeklyVwapData(t.symbol);
          if (data) {
            newVwapStore[t.id] = data;
            if (!newFirstSeen[t.id]) {
              newFirstSeen[t.id] = Date.now();
            }
          }
        } catch (e) { }
      }

      setVwapStore(newVwapStore);
      setFirstSeenTimes(newFirstSeen);
      setVwapLoading(false);
    };

    fetchSignals();
    const signalInterval = setInterval(fetchSignals, 60000);
    return () => clearInterval(signalInterval);
  }, [cexTickers, activeView]);

  // ─── Watchlist Handlers ─────────────────────────
  const handleAddToWatchlist = (ticker: CexTicker) => {
    const isDuplicate = watchlist.some(t => t.symbol === ticker.symbol && t.status === 'open');
    if (isDuplicate) return;

    const newTrade: WatchlistTrade = {
      id: crypto.randomUUID(),
      symbol: ticker.symbol,
      entryPrice: ticker.priceUsd,
      entryTime: Date.now(),
      amount: 100, // Fixed unit for simulation
      status: 'open'
    };
    const nextWatchlist = [newTrade, ...watchlist];
    setWatchlist(nextWatchlist);
    localStorage.setItem('dex_cex_watchlist', JSON.stringify(nextWatchlist));
  };

  const handleCloseTrade = (tradeId: string) => {
    // We need the current price to close. Find it in tickers.
    const trade = watchlist.find(t => t.id === tradeId);
    if (!trade) return;

    const ticker = cexTickers.find(t => t.symbol === trade.symbol);
    const currentPrice = ticker ? ticker.priceUsd : trade.entryPrice;

    const nextWatchlist = watchlist.map(t => {
      if (t.id === tradeId && t.status === 'open') {
        return {
          ...t,
          status: 'closed' as const,
          closePrice: currentPrice,
          closeTime: Date.now()
        };
      }
      return t;
    });
    setWatchlist(nextWatchlist);
    localStorage.setItem('dex_cex_watchlist', JSON.stringify(nextWatchlist));
  };

  const handleRemoveTrade = (tradeId: string) => {
    const nextWatchlist = watchlist.filter(t => t.id !== tradeId);
    setWatchlist(nextWatchlist);
    localStorage.setItem('dex_cex_watchlist', JSON.stringify(nextWatchlist));
  };

  return (
    <div className="min-h-screen bg-[#06080c] text-white selection:bg-blue-500/30">
      <DashboardHeader
        activeView={activeView}
        onViewChange={setActiveView}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        lastUpdated={lastUpdated}
        isScanning={cexLoading}
      />

      <main className="max-w-[1600px] mx-auto px-4 py-6 md:px-8">
        <div className="flex flex-col gap-6">
          {activeView === 'grid' ? (
            <CexGrid
              tickers={cexTickers}
              loading={cexLoading}
              onRefresh={loadCexData}
              onTickerClick={setSelectedCexTicker}
            />
          ) : activeView === 'scanner' ? (
            <VwapScanner
              tickers={cexTickers}
              onTickerClick={setSelectedCexTicker}
            />
          ) : activeView === 'decision' ? (
            <DecisionBuyAi
              tickers={cexTickers}
              vwapStore={vwapStore}
              firstSeenTimes={firstSeenTimes}
              isLoading={vwapLoading}
              onTickerClick={setSelectedCexTicker}
              onAddToWatchlist={handleAddToWatchlist}
            />
          ) : activeView === 'whale' ? (
            <WhaleScanner
              tickers={cexTickers}
              onTickerClick={setSelectedCexTicker}
            />
          ) : activeView === 'correlation' ? (
            <BtcCorrelation
              tickers={cexTickers}
              onTickerClick={setSelectedCexTicker}
            />
          ) : activeView === 'playbook' ? (
            <TradingPlaybook />
          ) : activeView === 'sentiment' ? (
            <AntfarmSentiment
              tickers={cexTickers}
              onTickerClick={setSelectedCexTicker}
            />
          ) : activeView === 'swap' ? (
            <SwapPanel tickers={cexTickers} />
          ) : activeView === 'news' ? (
            <NewsFeed />
          ) : activeView === 'vwapMulti' ? (
            <VwapMultiTF tickers={cexTickers} onTickerClick={setSelectedCexTicker} />
          ) : activeView === 'anchoredVWAP' ? (
            <VwapAnchorBot tickers={cexTickers} vwapStore={vwapStore} onTickerClick={setSelectedCexTicker} />
          ) : activeView === 'ecosystems' ? (
            <EcosystemGrid tickers={cexTickers} vwapStore={vwapStore} onTickerClick={setSelectedCexTicker} />
          ) : activeView === 'tma' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Market Architecture</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Deep Structural Analysis & PD Liquidity Engine</p>
                </div>
                <div className="flex bg-[#12141c] rounded-xl p-1 border border-gray-800">
                  <span className="px-4 py-1.5 text-xs font-black text-indigo-400 uppercase tracking-widest">Active Ticker: {selectedCexTicker?.symbol || 'BTC'}</span>
                </div>
              </div>
              <div className="h-[750px] relative">
                <TokenChart
                  address={selectedCexTicker?.id || 'BTCUSDT'}
                  symbol={selectedCexTicker?.symbol || 'BTC'}
                  isCex={true}
                  activeView="price"
                />
              </div>
            </div>
          ) : activeView === 'vwapArch' ? (
            <VwapArchView
              selectedCexTicker={selectedCexTicker}
              vwapArchState={vwapArchState}
              vwapArchLoading={vwapArchLoading}
              setVwapArchState={setVwapArchState}
              setVwapArchLoading={setVwapArchLoading}
            />
          ) : (
            <WatchlistPanel
              trades={watchlist}
              tickers={cexTickers}
              onCloseTrade={handleCloseTrade}
              onRemoveTrade={handleRemoveTrade}
              onTickerClick={setSelectedCexTicker}
            />
          )}
        </div>
      </main>

      {selectedCexTicker && (
        <CexDetailPanel
          ticker={selectedCexTicker}
          onClose={() => setSelectedCexTicker(null)}
          onAddToWatchlist={handleAddToWatchlist}
        />
      )}
    </div>
  );
};

export default App;
