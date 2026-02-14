
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker } from './types';
import { fetchCexTickers, initCexWebSocket } from './services/cexService';
import { DashboardHeader } from './components/DashboardHeader';
import { CexGrid } from './components/CexGrid';
import { CexDetailPanel } from './components/CexDetailPanel';

const App: React.FC = () => {
  // ─── CEX State (Primary) ────────────────────────
  const [cexTickers, setCexTickers] = useState<CexTicker[]>([]);
  const [cexLoading, setCexLoading] = useState(false);
  const [selectedCexTicker, setSelectedCexTicker] = useState<CexTicker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

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

  return (
    <div className="app-layout min-h-screen bg-[#0d0f14] text-gray-100 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <DashboardHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isScanning={false}
          lastUpdated={lastUpdated}
        />

        <main className="flex-1 p-4 md:p-6 overflow-hidden">
          <div className="h-full max-w-[1600px] mx-auto">
            <CexGrid
              tickers={cexTickers}
              loading={cexLoading}
              onRefresh={loadCexData}
              onTickerClick={setSelectedCexTicker}
            />
          </div>
        </main>
      </div>

      {/* CEX Detail Panel Overlay */}
      {selectedCexTicker && (
        <CexDetailPanel
          ticker={selectedCexTicker}
          onClose={() => setSelectedCexTicker(null)}
        />
      )}
    </div>
  );
};

export default App;
