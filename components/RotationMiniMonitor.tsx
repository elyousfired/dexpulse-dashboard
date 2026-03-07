import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Zap } from 'lucide-react';
import axios from 'axios';

interface ActiveHunt {
    symbol: string;
    entryPrice: number;
    currentPrice: number;
    peakPrice: number;
    status: string;
    strategyId: string;
}

export const RotationMiniMonitor: React.FC = () => {
    const [hunts, setHunts] = useState<ActiveHunt[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHunts = async () => {
        try {
            const res = await axios.get('/api/hunts');
            const rotationHunts = (res.data || []).filter(
                (h: any) => h.strategyId === 'golden_rotation' && h.status === 'active'
            );
            setHunts(rotationHunts);
        } catch (err) {
            console.error('MiniMonitor fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHunts();
        const interval = setInterval(fetchHunts, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading && hunts.length === 0) return null;

    return (
        <div className="mt-4 px-2 py-3 bg-[#0a0c14]/50 rounded-xl border border-gray-800/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rotation Live</span>
                </div>
                <span className="text-[10px] font-black text-cyan-500/80">{hunts.length}/3 Slots</span>
            </div>

            <div className="space-y-1.5">
                {hunts.length === 0 ? (
                    <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-900/30 border border-dashed border-gray-800">
                        <Zap size={10} className="text-gray-600" />
                        <span className="text-[9px] font-bold text-gray-600 uppercase">Scanning Markets...</span>
                    </div>
                ) : (
                    hunts.map((hunt) => {
                        const pnl = ((hunt.currentPrice - hunt.entryPrice) / hunt.entryPrice) * 100;
                        const isPos = pnl >= 0;

                        return (
                            <div key={hunt.symbol} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#12141c] border border-gray-800/50">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-[60px]">
                                        {hunt.symbol.replace('USDT', '')}
                                    </span>
                                </div>
                                <span className={`text-[10px] font-black ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                                    {isPos ? '+' : ''}{pnl.toFixed(1)}%
                                </span>
                            </div>
                        );
                    })
                )}
            </div>

            {hunts.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-800/50 flex items-center justify-center gap-1 opacity-50">
                    <ShieldCheck size={10} className="text-cyan-500" />
                    <span className="text-[8px] font-bold text-gray-500 uppercase">Swapping Active</span>
                </div>
            )}
        </div>
    );
};
