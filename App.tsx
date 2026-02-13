
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { NormalizedTokenItem, TokenScanResult, AgentLog, SortField, SortOrder, FilterState, TokenSecurityInfo, CexTicker } from './types';
import { fetchLatestBoostedTokens } from './services/dexService';
import { analyzeTokenSecurity, computeRiskScore, riskScoreToStatus } from './services/tokenSecurityService';
import { generateTokenSummary } from './services/aiAgentService';
import { fetchCexTickers, initCexWebSocket } from './services/cexService';
import { DashboardHeader } from './components/DashboardHeader';
import { AgentStatusPanel } from './components/AgentStatusPanel';
import { ScannerGrid } from './components/ScannerGrid';
import { SecurityPanel } from './components/SecurityPanel';
import { ManualScan } from './components/ManualScan';
import { CexGrid } from './components/CexGrid';
import { CexDetailPanel } from './components/CexDetailPanel';
import { AntfarmDashboard } from './components/AntfarmDashboard';
import { parseNumberShorthand } from './utils';

const App: React.FC = () => {
  // ─── Core State ────────────────────────────────
  const [tokens, setTokens] = useState<NormalizedTokenItem[]>([]);
  const [scanResults, setScanResults] = useState<Map<string, TokenScanResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('riskScore');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'dex' | 'cex' | 'antfarm'>('dex');

  // ─── CEX State ──────────────────────────────────
  const [cexTickers, setCexTickers] = useState<CexTicker[]>([]);
  const [cexLoading, setCexLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TokenScanResult | null>(null);
  const [selectedCexTicker, setSelectedCexTicker] = useState<CexTicker | null>(null);

  // ─── Agent State ───────────────────────────────
  const [isAutoScan, setIsAutoScan] = useState(true);
  const [selectedChain, setSelectedChain] = useState('all');
  const [agentState, setAgentState] = useState<'idle' | 'scanning' | 'alert'>('idle');
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isManualScanning, setIsManualScanning] = useState(false);

  // ─── Filters ───────────────────────────────────
  const [filters, setFilters] = useState<FilterState>({
    liquidityMin: '',
    liquidityMax: '',
    volumeMin: '',
    volumeMax: '',
    maxAgeHours: '',
    chain: 'all',
    riskLevel: 'all',
  });

  const scanQueueRef = useRef<NormalizedTokenItem[]>([]);
  const isScanningRef = useRef(false);
  const logIdRef = useRef(0);

  // ─── Helpers ───────────────────────────────────

  const addLog = useCallback((type: AgentLog['type'], message: string, tokenSymbol?: string) => {
    const log: AgentLog = {
      id: `log-${++logIdRef.current}`,
      timestamp: Date.now(),
      type,
      message,
      tokenSymbol,
    };
    setLogs(prev => [...prev.slice(-100), log]); // Keep last 100 logs
  }, []);

  // ─── Fetch Tokens ──────────────────────────────

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      addLog('info', '📡 Fetching latest boosted tokens...');
      const data = await fetchLatestBoostedTokens();
      setTokens(data);
      setLastUpdated(new Date());
      addLog('success', `✅ Loaded ${data.length} tokens`);

      // Create initial scan results for tokens that don't have one yet
      setScanResults(prev => {
        const next = new Map(prev);
        data.forEach(token => {
          if (!next.has(token.id)) {
            next.set(token.id, {
              token,
              security: null,
              riskScore: 50, // Default until scanned
              scanStatus: 'pending',
              aiVerdict: null,
              scannedAt: 0,
            });
          } else {
            // Update token data but keep security info
            const existing = next.get(token.id)!;
            next.set(token.id, { ...existing, token });
          }
        });
        return next;
      });

      // Queue for scanning
      scanQueueRef.current = [...data];
    } catch (err) {
      addLog('danger', '❌ Failed to fetch tokens — API may be down');
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  // ─── Manual Token Scan ─────────────────────────

  const handleManualScan = useCallback(async (address: string, chain: string) => {
    setIsManualScanning(true);
    addLog('scan', `🎯 Manual scan: ${address.slice(0, 8)}... on ${chain}`);
    setAgentState('scanning');

    try {
      // 1. Fetch token info from DexScreener
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      let tokenInfo: NormalizedTokenItem;

      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pairs = dexData.pairs || [];
        // Find best pair (highest liquidity on matching chain, or any)
        const matchingPair = pairs.find((p: any) => p.chainId === chain) || pairs[0];

        if (matchingPair) {
          const now = Date.now();
          const ageHours = matchingPair.pairCreatedAt
            ? Math.floor((now - matchingPair.pairCreatedAt) / (1000 * 60 * 60))
            : null;

          tokenInfo = {
            id: `manual-${chain}-${address}`,
            chainId: matchingPair.chainId || chain,
            tokenAddress: address,
            pairAddress: matchingPair.pairAddress || '',
            symbol: matchingPair.baseToken?.symbol || 'UNKNOWN',
            name: matchingPair.baseToken?.name || 'Unknown Token',
            priceUsd: matchingPair.priceUsd ? parseFloat(matchingPair.priceUsd) : null,
            liquidityUsd: matchingPair.liquidity?.usd || null,
            volume24h: matchingPair.volume?.h24 || null,
            url: matchingPair.url || `https://dexscreener.com/${chain}/${address}`,
            icon: matchingPair.info?.imageUrl || undefined,
            ageInHours: ageHours,
            rawBoost: { url: '', chainId: chain, tokenAddress: address, amount: 0, totalAmount: 0 },
          };
          addLog('success', `📋 Found: ${tokenInfo.symbol} (${tokenInfo.name})`, tokenInfo.symbol);
        } else {
          // No pairs found — create a minimal token entry
          tokenInfo = {
            id: `manual-${chain}-${address}`,
            chainId: chain,
            tokenAddress: address,
            pairAddress: '',
            symbol: address.slice(0, 6).toUpperCase(),
            name: 'Unknown Token',
            priceUsd: null,
            liquidityUsd: null,
            volume24h: null,
            url: `https://dexscreener.com/${chain}/${address}`,
            icon: undefined,
            ageInHours: null,
            rawBoost: { url: '', chainId: chain, tokenAddress: address, amount: 0, totalAmount: 0 },
          };
          addLog('warning', `⚠️ No trading pairs found — scanning security only`);
        }
      } else {
        tokenInfo = {
          id: `manual-${chain}-${address}`,
          chainId: chain,
          tokenAddress: address,
          pairAddress: '',
          symbol: address.slice(0, 6).toUpperCase(),
          name: 'Unknown Token',
          priceUsd: null,
          liquidityUsd: null,
          volume24h: null,
          url: `https://dexscreener.com/${chain}/${address}`,
          icon: undefined,
          ageInHours: null,
          rawBoost: { url: '', chainId: chain, tokenAddress: address, amount: 0, totalAmount: 0 },
        };
        addLog('warning', `⚠️ DexScreener lookup failed — scanning security only`);
      }

      // 2. Run security analysis
      addLog('scan', `🔍 Analyzing security for ${tokenInfo.symbol}...`, tokenInfo.symbol);
      const security = await analyzeTokenSecurity(address, chain);
      const riskScore = computeRiskScore(security, tokenInfo.liquidityUsd, tokenInfo.volume24h, tokenInfo.ageInHours);
      const scanStatus = riskScoreToStatus(riskScore);

      // 3. Generate AI verdict
      let aiVerdict: string | null = null;
      try {
        aiVerdict = await generateTokenSummary(tokenInfo, security, riskScore);
      } catch { /* optional */ }

      // 4. Create scan result
      const result: TokenScanResult = {
        token: tokenInfo,
        security,
        riskScore,
        scanStatus,
        aiVerdict,
        scannedAt: Date.now(),
      };

      // 5. Add to results map
      setScanResults(prev => {
        const next = new Map(prev);
        next.set(tokenInfo.id, result);
        return next;
      });

      // 6. Log result
      if (scanStatus === 'danger') {
        addLog('danger', `🚨 ${tokenInfo.symbol}: HIGH RISK (${riskScore}/100)`, tokenInfo.symbol);
        setAgentState('alert');
      } else if (scanStatus === 'warning') {
        addLog('warning', `⚠️ ${tokenInfo.symbol}: Moderate risk (${riskScore}/100)`, tokenInfo.symbol);
      } else {
        addLog('success', `✅ ${tokenInfo.symbol}: Safe (${riskScore}/100)`, tokenInfo.symbol);
      }

      // 7. Auto-open the detail panel
      setSelectedResult(result);

    } catch (error) {
      addLog('danger', `❌ Manual scan failed: ${error}`);
    } finally {
      setIsManualScanning(false);
      setAgentState('idle');
    }
  }, [addLog]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // ─── Auto-refresh every 60s ────────────────────
  useEffect(() => {
    if (!isAutoScan) return;
    const interval = setInterval(loadTokens, 60000);
    return () => clearInterval(interval);
  }, [isAutoScan, loadTokens]);

  // ─── Scanning Engine ──────────────────────────

  const scanToken = useCallback(async (token: NormalizedTokenItem) => {
    // Update status to scanning
    setScanResults(prev => {
      const next = new Map(prev);
      const existing = next.get(token.id);
      if (existing) {
        next.set(token.id, { ...existing, scanStatus: 'scanning' });
      }
      return next;
    });

    try {
      addLog('scan', `🔍 Scanning ${token.symbol} on ${token.chainId}...`, token.symbol);

      const security = await analyzeTokenSecurity(token.tokenAddress, token.chainId);
      const riskScore = computeRiskScore(security, token.liquidityUsd, token.volume24h, token.ageInHours);
      const scanStatus = riskScoreToStatus(riskScore);

      // Log result
      if (scanStatus === 'danger') {
        addLog('danger', `🚨 ${token.symbol}: HIGH RISK (${riskScore}/100)`, token.symbol);
        setAgentState('alert');
        setTimeout(() => setAgentState(prev => prev === 'alert' ? 'scanning' : prev), 3000);
      } else if (scanStatus === 'warning') {
        addLog('warning', `⚠️ ${token.symbol}: Moderate risk (${riskScore}/100)`, token.symbol);
      } else {
        addLog('success', `✅ ${token.symbol}: Safe (${riskScore}/100)`, token.symbol);
      }

      // Generate AI verdict (async, non-blocking)
      let aiVerdict: string | null = null;
      try {
        aiVerdict = await generateTokenSummary(token, security, riskScore);
      } catch {
        // Silently fail — verdict is optional
      }

      setScanResults(prev => {
        const next = new Map(prev);
        next.set(token.id, {
          token,
          security,
          riskScore,
          scanStatus,
          aiVerdict,
          scannedAt: Date.now(),
        });
        return next;
      });
    } catch (error) {
      addLog('warning', `⚠️ Failed to scan ${token.symbol}`, token.symbol);
      setScanResults(prev => {
        const next = new Map(prev);
        const existing = next.get(token.id);
        if (existing) {
          next.set(token.id, { ...existing, scanStatus: 'warning' });
        }
        return next;
      });
    }
  }, [addLog]);

  // ─── Process Scan Queue ────────────────────────
  useEffect(() => {
    if (!isAutoScan || isScanningRef.current || scanQueueRef.current.length === 0) return;

    const processQueue = async () => {
      isScanningRef.current = true;
      setAgentState('scanning');

      while (scanQueueRef.current.length > 0) {
        const token = scanQueueRef.current.shift()!;

        // Skip if already recently scanned (within 2 minutes)
        const existing = scanResults.get(token.id);
        if (existing && existing.scannedAt > Date.now() - 120000 && existing.scanStatus !== 'pending') {
          continue;
        }

        await scanToken(token);

        // Small delay between scans to avoid rate limiting
        await new Promise(r => setTimeout(r, 1500));
      }

      isScanningRef.current = false;
      setAgentState('idle');
      addLog('info', '💤 Scan complete. Agent idle.');
    };

    processQueue();
  }, [isAutoScan, tokens, scanToken, addLog]);

  // ─── Sorting & Filtering ──────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredResults = useMemo(() => {
    let results = Array.from(scanResults.values());

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(r =>
        r.token.symbol.toLowerCase().includes(term) ||
        r.token.name.toLowerCase().includes(term) ||
        r.token.tokenAddress.toLowerCase() === term
      );
    }

    // Chain filter
    if (filters.chain !== 'all') {
      results = results.filter(r => r.token.chainId === filters.chain);
    }

    // Risk level filter
    if (filters.riskLevel !== 'all') {
      results = results.filter(r => {
        if (filters.riskLevel === 'safe') return r.riskScore < 25;
        if (filters.riskLevel === 'warning') return r.riskScore >= 25 && r.riskScore < 50;
        return r.riskScore >= 50;
      });
    }

    // Liquidity filters
    const liqMin = parseNumberShorthand(filters.liquidityMin);
    const liqMax = parseNumberShorthand(filters.liquidityMax);
    if (liqMin !== null) results = results.filter(r => r.token.liquidityUsd !== null && r.token.liquidityUsd >= liqMin);
    if (liqMax !== null) results = results.filter(r => r.token.liquidityUsd !== null && r.token.liquidityUsd <= liqMax);

    // Volume filters
    const volMin = parseNumberShorthand(filters.volumeMin);
    const volMax = parseNumberShorthand(filters.volumeMax);
    if (volMin !== null) results = results.filter(r => r.token.volume24h !== null && r.token.volume24h >= volMin);
    if (volMax !== null) results = results.filter(r => r.token.volume24h !== null && r.token.volume24h <= volMax);

    // Sort
    results.sort((a, b) => {
      let valA: number, valB: number;
      if (sortField === 'riskScore') {
        valA = a.riskScore;
        valB = b.riskScore;
      } else {
        valA = a.token[sortField] ?? -1;
        valB = b.token[sortField] ?? -1;
      }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    return results;
  }, [scanResults, searchTerm, sortField, sortOrder, filters]);

  const threatsFound = useMemo(() => {
    return Array.from(scanResults.values()).filter(r => r.riskScore >= 50).length;
  }, [scanResults]);

  const tokensScanned = useMemo(() => {
    return Array.from(scanResults.values()).filter(r => r.scanStatus !== 'pending').length;
  }, [scanResults]);

  // Update chain filter when sidebar selection changes
  useEffect(() => {
    setFilters(prev => ({ ...prev, chain: selectedChain }));
  }, [selectedChain]);

  // ─── CEX Data Fetching ─────────────────────────

  const loadCexData = useCallback(async () => {
    setCexLoading(true);
    try {
      const data = await fetchCexTickers();
      setCexTickers(data);
    } catch (err) {
      console.error('CEX fetch error:', err);
    } finally {
      setCexLoading(false);
    }
  }, []);

  // Load CEX data when tab switches to cex, and auto-refresh every 30s
  useEffect(() => {
    if (activeTab !== 'cex') return;

    // Initial fetch
    loadCexData();

    // Start WebSocket for real-time updates
    const cleanup = initCexWebSocket((updates) => {
      setCexTickers(prev => {
        const next = [...prev];
        updates.forEach(update => {
          const idx = next.findIndex(t => t.id === update.id);
          if (idx !== -1) {
            // Merge update into existing entry (preserve sort or other meta if any)
            next[idx] = { ...next[idx], ...update };
          } else if (prev.length < 250) {
            // Optionally add new pairs if we have room
            next.push(update);
          }
        });
        return next;
      });
    });

    return () => cleanup();
  }, [activeTab, loadCexData]);



  return (
    <div className="app-layout">
      {/* Sidebar */}
      <AgentStatusPanel
        logs={logs}
        isAutoScan={isAutoScan}
        onToggleAutoScan={() => setIsAutoScan(prev => !prev)}
        selectedChain={selectedChain}
        onChainChange={setSelectedChain}
        agentState={agentState}
      />

      {/* Manual Scan - positioned below sidebar */}
      <div className="manual-scan-wrapper">
        <ManualScan
          onScan={handleManualScan}
          isScanning={isManualScanning}
        />
      </div>

      {/* Main Content */}
      <div className="main-content">
        <DashboardHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          tokensScanned={tokensScanned}
          threatsFound={threatsFound}
          isScanning={agentState === 'scanning'}
          lastUpdated={lastUpdated}
        />

        {/* Tab Switcher */}
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeTab === 'dex' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('dex')}
          >
            <span className="tab-icon">🔍</span>
            DEX Scanner
            <span className="tab-count">{tokensScanned}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'cex' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('cex')}
          >
            <span className="tab-icon">📊</span>
            CEX Markets
            <span className="tab-count">{cexTickers.length}</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'antfarm' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('antfarm')}
          >
            <span className="tab-icon">🤖</span>
            Antfarm AI
            <span className="tab-tag">NEW</span>
          </button>
        </div>

        <main className="main-body">
          {activeTab === 'dex' && (
            <ScannerGrid
              results={filteredResults}
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
              filters={filters}
              onFilterChange={setFilters}
              onTokenClick={setSelectedResult}
              loading={loading}
            />
          )}
          {activeTab === 'cex' && (
            <CexGrid
              tickers={cexTickers}
              loading={cexLoading}
              onRefresh={loadCexData}
              onTickerClick={setSelectedCexTicker}
            />
          )}
          {activeTab === 'antfarm' && (
            <AntfarmDashboard />
          )}
        </main>
      </div>

      {/* Security Panel Overlay */}
      {selectedResult && (
        <SecurityPanel
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
        />
      )}

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
