
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker } from './types';
import { fetchCexTickers, initCexWebSocket, VwapData, fetchWeeklyVwapData } from './services/cexService';
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
import { WatchlistTrade } from './types';

const App: React.FC = () => {
  // ─── CEX State (Primary) ────────────────────────
  const [cexTickers, setCexTickers] = useState<CexTicker[]>([]);
  const [cexLoading, setCexLoading] = useState(false);
  const [selectedCexTicker, setSelectedCexTicker] = useState<CexTicker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeView, setActiveView] = useState<'grid' | 'scanner' | 'decision' | 'watchlist' | 'whale' | 'correlation' | 'playbook' | 'sentiment' | 'swap' | 'news' | 'vwapMulti'>('grid');
  const [watchlist, setWatchlist] = useState<WatchlistTrade[]>(() => {
    const saved = localStorage.getItem('dexpulse_watchlist');
    return saved ? JSON.parse(saved) : [];
  });
  const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
  const [vwapLoading, setVwapLoading] = useState(false);
  const [firstSeenTimes, setFirstSeenTimes] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('dexpulse_golden_times');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('dexpulse_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  const handleAddToWatchlist = (ticker: CexTicker) => {
    const newTrade: WatchlistTrade = {
      id: Math.random().toString(36).substr(2, 9),
      symbol: ticker.symbol,
      entryPrice: ticker.priceUsd,
      entryTime: Date.now(),
      amount: 1000, // Default $1k simulator amount
      status: 'open'
    };
    setWatchlist(prev => [...prev, newTrade]);
  };

  const handleCloseTrade = (tradeId: string) => {
    setWatchlist(prev => prev.map(t => {
      if (t.id === tradeId) {
        const ticker = cexTickers.find(ct => ct.symbol === t.symbol);
        return {
          ...t,
          status: 'closed',
          closePrice: ticker?.priceUsd || t.entryPrice,
          closeTime: Date.now()
        };
      }
      return t;
    }));
  };

  const handleRemoveTrade = (tradeId: string) => {
    setWatchlist(prev => prev.filter(t => t.id !== tradeId));
  };

  // ─── CEX Data Fetching ─────────────────────────
  const loadCexData = useCallback(async () => {
    setCexLoading(true);
    try {
      const data = await fetchCexTickers();
      setCexTickers(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('CEX fetch error:', err);
    } finally {
      setCexLoading(false);
    }
  }, []);

  // Initial load and WebSocket setup
  useEffect(() => {
    loadCexData();

    // Start WebSocket for real-time updates
    const cleanup = initCexWebSocket((updates) => {
      setCexTickers(prev => {
        const next = [...prev];
        updates.forEach(update => {
          const idx = next.findIndex(t => t.id === update.id);
          if (idx !== -1) {
            next[idx] = { ...next[idx], ...update };
          } else if (prev.length < 250) {
            next.push(update);
          }
        });
        return next;
      });
    });

    return () => cleanup();
  }, [loadCexData]);

  // ─── BACKGROUND VWAP SCANNING (Decision Buy AI) ───
  useEffect(() => {
    const scanGoldenData = async () => {
      if (cexTickers.length === 0) return;
      setVwapLoading(true);
      const results: Record<string, VwapData> = {};
      const targetSymbols = cexTickers.slice(0, 100);

      const CHUNK_SIZE = 10;
      for (let i = 0; i < targetSymbols.length; i += CHUNK_SIZE) {
        const chunk = targetSymbols.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (t) => {
          const data = await fetchWeeklyVwapData(t.symbol);
          if (data) results[t.id] = data;
        }));
      }
      setVwapStore(results);
      setVwapLoading(false);
    };

    scanGoldenData();
    const interval = setInterval(scanGoldenData, 1000 * 60 * 5); // Refresh every 5 mins
    return () => clearInterval(interval);
  }, [cexTickers.length > 0]);

  // ─── GOLDEN SIGNAL PERFORMANCE TRACKING ───────────
  useEffect(() => {
    if (Object.keys(vwapStore).length === 0 || vwapLoading) return;

    const isMonday = new Date().getUTCDay() === 1;
    const currentGoldenIds = new Set(
      cexTickers
        .filter(t => {
          const vwap = vwapStore[t.id];
          if (!vwap) return false;
          return isMonday
            ? (t.priceUsd > vwap.max && t.priceUsd > vwap.min && t.priceUsd > vwap.mid)
            : (t.priceUsd > vwap.max && t.priceUsd > vwap.min);
        })
        .map(t => t.id)
    );

    setFirstSeenTimes(prev => {
      const next = { ...prev };
      let changed = false;

      currentGoldenIds.forEach(id => {
        if (!next[id]) {
          next[id] = Date.now();
          changed = true;
        }
      });

      Object.keys(next).forEach(id => {
        if (!currentGoldenIds.has(id)) {
          const existsInScannedList = cexTickers.some(t => t.id === id);
          if (existsInScannedList && vwapStore[id]) {
            delete next[id];
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [cexTickers, vwapStore, vwapLoading]);

  // Persist Golden Timers
  useEffect(() => {
    localStorage.setItem('dexpulse_golden_times', JSON.stringify(firstSeenTimes));
  }, [firstSeenTimes]);

  return (
    <div className="app-layout min-h-screen bg-[#0d0f14] text-gray-100 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <DashboardHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isScanning={false}
          lastUpdated={lastUpdated}
          activeView={activeView}
          onViewChange={setActiveView}
        />

        <main className="flex-1 p-4 md:p-6 overflow-hidden">
          <div className="h-full max-w-[1600px] mx-auto">
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
      </div>

      {/* CEX Detail Panel Overlay */}
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
