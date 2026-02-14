
import React from 'react';
import { Search, Zap, Shield, Activity } from 'lucide-react';

interface DashboardHeaderProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    isScanning: boolean;
    lastUpdated: Date;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    searchTerm,
    onSearchChange,
    isScanning,
    lastUpdated,
}) => {
    return (
        <header className="dashboard-header">
            <div className="header-inner">
                {/* Brand */}
                <div className="header-brand">
                    <div className="brand-logo">
                        <Zap className="brand-icon" />
                    </div>
                    <div>
                        <h1 className="brand-title">DexPulse</h1>
                        <p className="brand-subtitle">AI Token Scanner</p>
                    </div>
                </div>

                {/* Search */}
                <div className="header-search-wrap">
                    <Search className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by symbol, name, or address..."
                        className="header-search"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>

                {/* Stats */}
                <div className="header-stats">
                    <div className="stat-item">
                        <Activity className="stat-icon stat-icon-blue" />
                        <div>
                            <span className="stat-value">{lastUpdated.toLocaleTimeString()}</span>
                            <span className="stat-label">Last Sync</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};
