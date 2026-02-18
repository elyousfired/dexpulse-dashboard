
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker, VwapData, WatchlistTrade } from './types';
import { fetchCexTickers, initCexWebSocket, fetchWeeklyVwapData } from './services/cexService';
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

const App: React.FC = () => {
  // ─── CEX State (Primary) ────────────────────────
  const [cexTickers, setCexTickers] = useState<CexTicker[]>([]);
  const [cexLoading, setCexLoading] = useState(false);
  const [selectedCexTicker, setSelectedCexTicker] = useState<CexTicker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeView, setActiveView] = useState<'grid' | 'scanner' | 'decision' | 'watchlist' | 'whale' | 'correlation' | 'playbook' | 'sentiment' | 'swap' | 'news' | 'vwapMulti' | 'anchoredVWAP' | 'ecosystems'>('grid');
  const [watchlist, setWatchlist] = useState<WatchlistTrade[]>(() => {
    const saved = localStorage.getItem('dex_cex_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  // ─── AI Signal Engine State ─────────────────────
  const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
  const [firstSeenTimes, setFirstSeenTimes] = useState<Record<string, number>>({});
  const [vwapLoading, setVwapLoading] = useState(false);

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
    };

    fetchSignals();
    const signalInterval = setInterval(fetchSignals, 60000);
    return () => clearInterval(signalInterval);
  }, [cexTickers, activeView]);

  // ─── Watchlist Handlers ─────────────────────────
  const handleAddToWatchlist = (symbol: string, entryPrice: number) => {
    const isDuplicate = watchlist.some(t => t.symbol === symbol && t.status === 'open');
    if (isDuplicate) return;

    const newTrade: WatchlistTrade = {
      id: crypto.randomUUID(),
      symbol,
      entryPrice,
      entryTime: Date.now(),
      amount: 100, // Fixed unit for simulation
      status: 'open'
    };
    const nextWatchlist = [newTrade, ...watchlist];
    setWatchlist(nextWatchlist);
    localStorage.setItem('dex_cex_watchlist', JSON.stringify(nextWatchlist));
  };

  const handleCloseTrade = (tradeId: string, currentPrice: number) => {
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
