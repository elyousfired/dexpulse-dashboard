
import React from 'react';
import { Search, Zap, Shield, Activity } from 'lucide-react';

interface DashboardHeaderProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    isScanning: boolean;
    lastUpdated: Date;
    activeView: 'grid' | 'scanner';
    onViewChange: (view: 'grid' | 'scanner') => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    searchTerm,
    onSearchChange,
    isScanning,
    lastUpdated,
    activeView,
    onViewChange
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
                        <p className="brand-subtitle underline decoration-yellow-500/50 underline-offset-4">CEX Terminal</p>
                    </div>
                </div>

                {/* View Switcher */}
                <div className="flex bg-black/40 p-1 rounded-xl border border-gray-800 ml-4">
                    <button
                        onClick={() => onViewChange('grid')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'grid' ? 'bg-gray-800 text-white shadow-xl' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Search className="w-3.5 h-3.5" />
                        Market Grid
                    </button>
                    <button
                        onClick={() => onViewChange('scanner')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'scanner' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Activity className="w-3.5 h-3.5" />
                        VWAP Scan
                    </button>
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
