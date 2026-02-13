
import React from 'react';
import { ArrowUpDown, ShieldCheck, ShieldAlert, ShieldX, LayoutGrid } from 'lucide-react';
import { TokenScanResult, SortField, SortOrder, FilterState } from '../types';
import { TokenCard } from './TokenCard';

interface ScannerGridProps {
    results: TokenScanResult[];
    sortField: SortField;
    sortOrder: SortOrder;
    onSort: (field: SortField) => void;
    filters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    onTokenClick: (result: TokenScanResult) => void;
    loading: boolean;
}

const RISK_FILTERS = [
    { id: 'all', label: 'All', icon: LayoutGrid },
    { id: 'safe', label: 'Safe', icon: ShieldCheck },
    { id: 'warning', label: 'Caution', icon: ShieldAlert },
    { id: 'danger', label: 'Danger', icon: ShieldX },
];

const SORT_OPTIONS: { field: SortField; label: string }[] = [
    { field: 'riskScore', label: 'Risk Score' },
    { field: 'liquidityUsd', label: 'Liquidity' },
    { field: 'volume24h', label: 'Volume' },
    { field: 'ageInHours', label: 'Age' },
];

export const ScannerGrid: React.FC<ScannerGridProps> = ({
    results,
    sortField,
    sortOrder,
    onSort,
    filters,
    onFilterChange,
    onTokenClick,
    loading,
}) => {
    return (
        <div className="scanner-grid-container">
            {/* Controls Bar */}
            <div className="grid-controls">
                {/* Risk Level Filter Pills */}
                <div className="filter-pills">
                    {RISK_FILTERS.map(rf => {
                        const IconComp = rf.icon;
                        const count = rf.id === 'all' ? results.length :
                            results.filter(r =>
                                rf.id === 'safe' ? r.riskScore < 25 :
                                    rf.id === 'warning' ? r.riskScore >= 25 && r.riskScore < 50 :
                                        r.riskScore >= 50
                            ).length;

                        return (
                            <button
                                key={rf.id}
                                onClick={() => onFilterChange({ ...filters, riskLevel: rf.id })}
                                className={`filter-pill ${filters.riskLevel === rf.id ? 'filter-pill-active' : ''} filter-pill-${rf.id}`}
                            >
                                <IconComp className="filter-pill-icon" />
                                <span>{rf.label}</span>
                                <span className="filter-pill-count">{count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Sort Controls */}
                <div className="sort-controls">
                    <ArrowUpDown className="sort-icon" />
                    {SORT_OPTIONS.map(opt => (
                        <button
                            key={opt.field}
                            onClick={() => onSort(opt.field)}
                            className={`sort-btn ${sortField === opt.field ? 'sort-btn-active' : ''}`}
                        >
                            {opt.label}
                            {sortField === opt.field && (
                                <span className="sort-arrow">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid-loading">
                    <div className="grid-loading-inner">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="skeleton-card">
                                <div className="skeleton-line skeleton-wide" />
                                <div className="skeleton-line skeleton-medium" />
                                <div className="skeleton-line skeleton-narrow" />
                                <div className="skeleton-stats">
                                    <div className="skeleton-stat" />
                                    <div className="skeleton-stat" />
                                    <div className="skeleton-stat" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : results.length === 0 ? (
                <div className="grid-empty">
                    <ShieldCheck className="grid-empty-icon" />
                    <h3>No tokens found</h3>
                    <p>Try adjusting your filters or wait for new tokens to appear.</p>
                </div>
            ) : (
                <div className="token-grid">
                    {results.map(result => (
                        <TokenCard
                            key={result.token.id}
                            result={result}
                            onClick={() => onTokenClick(result)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
