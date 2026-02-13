
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { CexTicker } from '../types';
import { formatLargeNumber } from '../services/cexService';
import { TrendingUp, TrendingDown, ArrowUpDown, BarChart3, Activity, Search, RefreshCcw } from 'lucide-react';
import { CexRow } from './CexRow';

interface CexGridProps {
    tickers: CexTicker[];
    loading: boolean;
    onRefresh: () => void;
    onTickerClick: (ticker: CexTicker) => void;
}

type CexSortField = 'volume24h' | 'priceChangePercent24h' | 'priceUsd';

export const CexGrid: React.FC<CexGridProps> = ({ tickers, loading, onRefresh, onTickerClick }) => {
    const [sortField, setSortField] = useState<CexSortField>('volume24h');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [cexSearch, setCexSearch] = useState('');

    const handleSort = useCallback((field: CexSortField) => {
        setSortField(prevField => {
            if (prevField === field) {
                setSortOrder(prevOrder => prevOrder === 'desc' ? 'asc' : 'desc');
                return prevField;
            }
            setSortOrder('desc');
            return field;
        });
    }, []);

    const sorted = useMemo(() => {
        let data = [...tickers];

        if (cexSearch) {
            const q = cexSearch.toLowerCase();
            data = data.filter(t => t.symbol.toLowerCase().includes(q) || t.pair.toLowerCase().includes(q));
        }

        data.sort((a, b) => {
            const va = a[sortField];
            const vb = b[sortField];
            return sortOrder === 'desc' ? vb - va : va - vb;
        });
        return data;
    }, [tickers, sortField, sortOrder, cexSearch]);

    // Summary stats (calculated only on ticker changes)
    const { totalVolume, avgChange, gainers, losers } = useMemo(() => ({
        totalVolume: tickers.reduce((s, t) => s + t.volume24h, 0),
        avgChange: tickers.length > 0 ? tickers.reduce((s, t) => s + t.priceChangePercent24h, 0) / tickers.length : 0,
        gainers: tickers.filter(t => t.priceChangePercent24h > 0).length,
        losers: tickers.filter(t => t.priceChangePercent24h < 0).length
    }), [tickers]);

    const sortOptions: { key: CexSortField, label: string }[] = [
        { key: 'volume24h', label: 'Volume' },
        { key: 'priceChangePercent24h', label: 'Change %' },
        { key: 'priceUsd', label: 'Price' },
    ];

    if (loading && tickers.length === 0) {
        return (
            <div className="cex-grid-loading">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="cex-skeleton-row">
                        <div className="skeleton-line skeleton-narrow" />
                        <div className="skeleton-line skeleton-medium" />
                        <div className="skeleton-line skeleton-narrow" />
                        <div className="skeleton-line skeleton-wide" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="cex-container">
            {/* Summary Bar */}
            <div className="cex-summary">
                <div className="cex-summary-item">
                    <BarChart3 className="cex-summary-icon" />
                    <div>
                        <span className="cex-summary-value">${formatLargeNumber(totalVolume)}</span>
                        <span className="cex-summary-label">Total 24h Volume</span>
                    </div>
                </div>
                <div className="cex-summary-item">
                    <Activity className="cex-summary-icon" />
                    <div>
                        <span className={`cex-summary-value ${avgChange >= 0 ? 'cex-green' : 'cex-red'}`}>
                            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                        </span>
                        <span className="cex-summary-label">Market Avg Change</span>
                    </div>
                </div>
                <div className="cex-summary-item">
                    <TrendingUp className="cex-summary-icon cex-green" />
                    <div>
                        <span className="cex-summary-value cex-green">{gainers}</span>
                        <span className="cex-summary-label">Active Gainers</span>
                    </div>
                </div>
                <div className="cex-summary-item">
                    <TrendingDown className="cex-summary-icon cex-red" />
                    <div>
                        <span className="cex-summary-value cex-red">{losers}</span>
                        <span className="cex-summary-label">Active Losers</span>
                    </div>
                </div>
            </div>

            {/* Search + Sort Controls */}
            <div className="cex-controls">
                <div className="cex-search-wrap">
                    <Search className="cex-search-icon" />
                    <input
                        type="text"
                        className="cex-search"
                        placeholder="Search by Symbol or Pair (e.g. BTC, ETH/USDT)..."
                        value={cexSearch}
                        onChange={e => setCexSearch(e.target.value)}
                    />
                </div>
                <div className="cex-sort-row">
                    <div className="realtime-badge">
                        <div className="pulse-dot"></div>
                        Live Updates
                    </div>
                    <ArrowUpDown className="sort-icon" />
                    {sortOptions.map(s => (
                        <button
                            key={s.key}
                            className={`sort-btn ${sortField === s.key ? 'sort-btn-active' : ''}`}
                            onClick={() => handleSort(s.key)}
                        >
                            {s.label}
                            {sortField === s.key && (
                                <span className="sort-arrow">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                            )}
                        </button>
                    ))}
                    <button className="refresh-btn" onClick={onRefresh} title="Manual Refresh">
                        <RefreshCcw className={`refresh-icon ${loading ? 'spinning' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Ticker Table */}
            <div className="cex-table-wrap">
                <table className="cex-table">
                    <thead>
                        <tr>
                            <th className="cex-th cex-th-rank">#</th>
                            <th className="cex-th cex-th-token">Token / Pair</th>
                            <th className="cex-th cex-th-price">Price (USD)</th>
                            <th className="cex-th cex-th-change">24h Change</th>
                            <th className="cex-th cex-th-range">24h Range (Low/High)</th>
                            <th className="cex-th cex-th-volume">24h Volume</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((t, idx) => (
                            <CexRow
                                key={t.id}
                                ticker={t}
                                index={idx}
                                onClick={onTickerClick}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {sorted.length === 0 && !loading && (
                <div className="cex-empty">
                    <p>No tokens match your search criteria.</p>
                </div>
            )}
        </div>
    );
};
