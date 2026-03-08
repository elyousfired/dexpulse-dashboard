import { RotationMiniMonitor } from './RotationMiniMonitor';
import { ActiveHunt } from '../types';

interface SidebarProps {
    activeStrategy: string;
    onSelectStrategy: (id: string) => void;
    activeHunts: ActiveHunt[];
}

const strategies = [
    { id: 'golden_signal', name: 'Golden Signal', icon: '🏆' },
    { id: 'golden_rotation', name: 'VWAP Rotation', icon: '🛰️' },
    { id: 'scalper', name: 'Scalper 5m', icon: '⚡' },
    { id: 'whale_tracker', name: 'Whale Tracker', icon: '🐋' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeStrategy, onSelectStrategy, activeHunts }) => {
    return (
        <div className="w-64 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 h-screen sticky top-0 flex flex-col p-4">
            <div className="flex items-center gap-3 px-2 mb-8 mt-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-white">
                    DP
                </div>
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                    Dexpulse Hub
                </h2>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-1">
                {strategies.map((strat) => (
                    <button
                        key={strat.id}
                        onClick={() => onSelectStrategy(strat.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activeStrategy === strat.id
                            ? 'bg-gradient-to-r from-blue-600/20 to-cyan-500/20 text-white border border-blue-500/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <span className="text-xl group-hover:scale-110 transition-transform">{strat.icon}</span>
                        <span className="font-medium text-sm">{strat.name}</span>
                        {activeStrategy === strat.id && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                        )}
                    </button>
                ))}

                <RotationMiniMonitor activeHunts={activeHunts} />
            </nav>

            <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">System Status</div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-slate-300">SATELLITE LINKED</span>
                </div>
            </div>
        </div>
    );
};
