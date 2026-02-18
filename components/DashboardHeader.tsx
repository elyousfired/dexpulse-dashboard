
import React from 'react';
import { Search, Zap, Shield, Activity, Brain, LayoutList, Anchor, GitCompare, BookOpen, Users, Repeat, Newspaper, Layers, Bot, Compass } from 'lucide-react';

interface DashboardHeaderProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    isScanning: boolean;
    lastUpdated: Date;
    activeView: 'grid' | 'scanner' | 'decision' | 'watchlist' | 'whale' | 'correlation' | 'playbook' | 'sentiment' | 'swap' | 'news' | 'vwapMulti' | 'anchoredVWAP' | 'ecosystems' | 'tma';
    onViewChange: (view: 'grid' | 'scanner' | 'decision' | 'watchlist' | 'whale' | 'correlation' | 'playbook' | 'sentiment' | 'swap' | 'news' | 'vwapMulti' | 'anchoredVWAP' | 'ecosystems' | 'tma') => void;
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
        <header className="dashboard-header text-white">
            <div className="header-inner flex items-center justify-between px-6 py-3 bg-[#0d0f14]/80 backdrop-blur-xl border-b border-gray-800">
                {/* Brand */}
                <div className="header-brand flex items-center gap-3">
                    <div className="brand-logo w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Zap className="brand-icon text-white w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="brand-title text-lg font-black tracking-tighter uppercase italic">DexPulse</h1>
                        <p className="brand-subtitle text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">CEX Terminal</p>
                    </div>
                </div>

                {/* View Switcher */}
                <div className="flex bg-black/40 p-1 rounded-xl border border-gray-800 mx-4 overflow-x-auto no-scrollbar max-w-[70%] lg:max-w-none">
                    <button
                        onClick={() => onViewChange('grid')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'grid' ? 'bg-gray-800 text-white shadow-xl' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Search className="w-3.5 h-3.5" />
                        Market Grid
                    </button>
                    <button
                        onClick={() => onViewChange('scanner')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'scanner' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Activity className="w-3.5 h-3.5" />
                        VWAP Scan
                    </button>
                    <button
                        onClick={() => onViewChange('whale')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'whale' ? 'bg-blue-600/20 text-blue-400 border border-blue-600/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Anchor className="w-3.5 h-3.5" />
                        Whales
                    </button>
                    <button
                        onClick={() => onViewChange('correlation')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'correlation' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <GitCompare className="w-3.5 h-3.5" />
                        BTC Core
                    </button>
                    <button
                        onClick={() => onViewChange('decision')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'decision' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Brain className="w-3.5 h-3.5" />
                        AI Signals
                    </button>
                    <button
                        onClick={() => onViewChange('watchlist')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'watchlist' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <LayoutList className="w-3.5 h-3.5" />
                        Watchlist
                    </button>
                    <button
                        onClick={() => onViewChange('vwapMulti')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'vwapMulti' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Multi-V
                    </button>
                    <button
                        onClick={() => onViewChange('ecosystems')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'ecosystems' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Ecosystems
                    </button>
                    <button
                        onClick={() => onViewChange('anchoredVWAP')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'anchoredVWAP' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Bot className="w-3.5 h-3.5" />
                        Anchor
                    </button>

                    <div className="w-px h-6 bg-gray-800 mx-2 hidden lg:block" />

                    <button
                        onClick={() => onViewChange('tma')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'tma' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Compass className="w-3.5 h-3.5" />
                        TMA ARCHITECTURE
                    </button>
                </div>

                {/* Search & Stats */}
                <div className="flex items-center gap-6">
                    <div className="relative group hidden xl:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search TICKER..."
                            className="bg-black/40 border border-gray-800 rounded-xl pl-9 pr-4 py-1.5 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-all w-48"
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 pl-6 border-l border-gray-800">
                        <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5">
                                <Activity className={`w-3 h-3 ${isScanning ? 'text-blue-500 animate-pulse' : 'text-emerald-500'}`} />
                                <span className="text-[10px] font-black text-white">{lastUpdated.toLocaleTimeString()}</span>
                            </div>
                            <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest leading-none mt-1">Satellite Link</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};
