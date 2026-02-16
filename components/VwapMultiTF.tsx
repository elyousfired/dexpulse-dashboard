
import React, { useState, useEffect, useCallback } from 'react';
import { CexTicker } from '../types';
import { fetchTokenVwapProfile, TokenVwapProfile, TIMEFRAMES } from '../services/vwapMultiService';
import { formatPrice } from '../services/cexService';
import {
    BarChart3, Loader2, RefreshCw, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownRight, Filter, Layers, ChevronUp, ChevronDown,
    Bell, BellOff, Volume2
} from 'lucide-react';
import { wasAlertedToday, sendGoldenSignalAlert } from '../services/telegramService';

interface VwapMultiTFProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

const TF_COLORS: Record<string, string> = {
    weekly: '#f59e0b',
    '1d': '#8b5cf6',
    '4h': '#3b82f6',
    '1h': '#06b6d4',
    '30m': '#10b981',
    '15m': '#6366f1',
};

export const VwapMultiTF: React.FC<VwapMultiTFProps> = ({ tickers, onTickerClick }) => {
    const [profiles, setProfiles] = useState<TokenVwapProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTF, setActiveTF] = useState('1d');
    const [showAboveOnly, setShowAboveOnly] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('vwap_audio_enabled') === 'true');
    const alertedRef = React.useRef<Set<string>>(new Set());
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    // Initialize audio
    useEffect(() => {
        audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audioRef.current.volume = 0.5;
    }, []);

    const playAlarm = () => {
        if (!audioEnabled || !audioRef.current) return;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log('Audio blocked:', e));
    };

    const toggleAudio = () => {
        const newValue = !audioEnabled;
        setAudioEnabled(newValue);
        localStorage.setItem('vwap_audio_enabled', String(newValue));
    };

    const loadProfiles = useCallback(async () => {
        setLoading(true);
        const top50 = tickers.slice(0, 50);
        const results: TokenVwapProfile[] = [];

        const CHUNK = 5;
        for (let i = 0; i < top50.length; i += CHUNK) {
            const chunk = top50.slice(i, i + CHUNK);
            const chunkResults = await Promise.all(
                chunk.map(t => fetchTokenVwapProfile(t.symbol, t.priceUsd, t.priceChangePercent24h))
            );
            chunkResults.forEach(r => { if (r) results.push(r); });
        }

        setProfiles(results);
        setLoading(false);
    }, [tickers]);

    useEffect(() => { if (tickers.length > 0) loadProfiles(); }, [tickers.length > 0]);

    // Filter by active timeframe
    const filtered = profiles
        .filter(p => {
            const level = p.levels.find(l => l.timeframe === activeTF);
            if (!level) return false;
            return showAboveOnly ? level.isAbove : !level.isAbove;
        })
        .sort((a, b) => {
            const aLevel = a.levels.find(l => l.timeframe === activeTF);
            const bLevel = b.levels.find(l => l.timeframe === activeTF);
            if (!aLevel || !bLevel) return 0;
            return showAboveOnly
                ? bLevel.priceVsVwap - aLevel.priceVsVwap
                : aLevel.priceVsVwap - bLevel.priceVsVwap;
        });

    // ─── ALARM TRIGGER LOGIC (Monday & Full Long) ───
    useEffect(() => {
        if (loading || profiles.length === 0) return;

        const isMonday = new Date().getUTCDay() === 1;

        profiles.forEach(p => {
            if (alertedRef.current.has(p.symbol)) return;

            const aboveAll = p.aboveCount === 6;

            // Monday specific: Above 4h, 1h, 15m
            const v4h = p.levels.find(l => l.timeframe === '4h')?.isAbove;
            const v1h = p.levels.find(l => l.timeframe === '1h')?.isAbove;
            const v15m = p.levels.find(l => l.timeframe === '15m')?.isAbove;
            const isMondayMatch = isMonday && v4h && v1h && v15m && p.change24h > 5;
            const isConvergence = v4h && v1h && v15m;

            if (aboveAll || isMondayMatch) {
                // Double check persisted alerts to avoid cross-component spam
                if (!wasAlertedToday(p.symbol)) {
                    playAlarm();
                    alertedRef.current.add(p.symbol);

                    // Telegram alert ONLY for the specific convergence (4H/1H/15M)
                    if (isConvergence) {
                        sendGoldenSignalAlert({
                            symbol: p.symbol,
                            price: p.price,
                            change24h: p.change24h,
                            score: p.aboveCount * 16.6,
                            vwapMax: p.levels.find(l => l.timeframe === '4h')?.vwap || 0,
                            vwapMid: p.levels.find(l => l.timeframe === '1h')?.vwap || 0,
                            reason: `MTF Convergence: Price above 4H, 1H, and 15m VWAP. Strong intra-day momentum.`,
                            type: 'CONVERGENCE'
                        });
                    }
                }
            }
        });
    }, [profiles, loading, audioEnabled]);

    const activeTFLabel = TIMEFRAMES.find(t => t.key === activeTF)?.label || activeTF;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/20 to-violet-500/20 border border-amber-500/30">
                        <Layers className="w-8 h-8 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Multi-TF VWAP</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                            Volume Weighted Average Price · 6 Timeframes
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleAudio}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${audioEnabled
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                            : 'bg-gray-800/50 text-gray-500 border-gray-700'
                            }`}
                    >
                        {audioEnabled ? <Volume2 className="w-4 h-4 animate-pulse" /> : <BellOff className="w-4 h-4" />}
                        <span className="text-[10px] font-black uppercase">{audioEnabled ? 'Alarm ON' : 'Alarm OFF'}</span>
                    </button>

                    <button
                        onClick={() => {
                            const original = audioEnabled;
                            setAudioEnabled(true);
                            setTimeout(() => {
                                playAlarm();
                                setAudioEnabled(original);
                            }, 50);
                        }}
                        className="p-2.5 bg-gray-800/50 hover:bg-gray-700 rounded-xl border border-gray-700 transition-all text-gray-400 hover:text-white"
                        title="Test Alarm"
                    >
                        <Bell className="w-4 h-4" />
                    </button>

                    <button onClick={loadProfiles} disabled={loading} className="p-2.5 bg-gray-800/50 hover:bg-gray-700 rounded-xl border border-gray-700 transition-all">
                        <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Timeframe Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {TIMEFRAMES.map(tf => (
                    <button key={tf.key} onClick={() => setActiveTF(tf.key)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${activeTF === tf.key
                            ? 'text-white shadow-lg'
                            : 'bg-[#12141c] text-gray-500 border-gray-800 hover:text-gray-300'
                            }`}
                        style={activeTF === tf.key ? {
                            backgroundColor: `${TF_COLORS[tf.key]}20`,
                            borderColor: `${TF_COLORS[tf.key]}50`,
                            color: TF_COLORS[tf.key],
                            boxShadow: `0 0 20px ${TF_COLORS[tf.key]}15`
                        } : {}}>
                        {tf.label}
                    </button>
                ))}

                {/* Above/Below Toggle */}
                <div className="ml-auto flex bg-black/40 p-1 rounded-xl border border-gray-800">
                    <button onClick={() => setShowAboveOnly(true)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 transition-all ${showAboveOnly ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-500'
                            }`}>
                        <ChevronUp className="w-3 h-3" /> Above VWAP
                    </button>
                    <button onClick={() => setShowAboveOnly(false)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 transition-all ${!showAboveOnly ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-gray-500'
                            }`}>
                        <ChevronDown className="w-3 h-3" /> Below VWAP
                    </button>
                </div>
            </div>

            {/* Stats Banner */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#12141c] rounded-xl border border-gray-800 p-4 text-center">
                    <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Tokens Scanned</div>
                    <div className="text-2xl font-black text-white">{profiles.length}</div>
                </div>
                <div className="bg-[#12141c] rounded-xl border border-emerald-500/20 p-4 text-center">
                    <div className="text-[9px] text-emerald-500/60 font-black uppercase tracking-widest mb-1">Above {activeTFLabel} VWAP</div>
                    <div className="text-2xl font-black text-emerald-400">
                        {profiles.filter(p => p.levels.find(l => l.timeframe === activeTF)?.isAbove).length}
                    </div>
                </div>
                <div className="bg-[#12141c] rounded-xl border border-rose-500/20 p-4 text-center">
                    <div className="text-[9px] text-rose-500/60 font-black uppercase tracking-widest mb-1">Below {activeTFLabel} VWAP</div>
                    <div className="text-2xl font-black text-rose-400">
                        {profiles.filter(p => p.levels.find(l => l.timeframe === activeTF && !l.isAbove)).length}
                    </div>
                </div>
            </div>

            {/* Token List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                    <span className="ml-3 text-sm text-gray-500 font-bold">Computing VWAP across {TIMEFRAMES.length} timeframes...</span>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((profile) => {
                        const activeLevel = profile.levels.find(l => l.timeframe === activeTF);
                        if (!activeLevel) return null;
                        const ticker = tickers.find(t => t.symbol === profile.symbol);

                        return (
                            <button key={profile.symbol} onClick={() => ticker && onTickerClick(ticker)}
                                className="w-full group bg-[#12141c] rounded-2xl border border-gray-800 hover:border-gray-600 p-5 transition-all duration-300 hover:shadow-lg">
                                <div className="flex items-center justify-between mb-4">
                                    {/* Token Info */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm bg-gray-800 text-white border border-gray-700">
                                            {profile.symbol.charAt(0)}
                                        </div>
                                        <div className="text-left">
                                            <span className="text-white font-black text-sm">{profile.symbol}/USDT</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-gray-500 font-bold">${formatPrice(profile.price)}</span>
                                                <span className={`text-[10px] font-black ${profile.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {profile.change24h >= 0 ? '+' : ''}{profile.change24h.toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Active TF VWAP */}
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-[9px] text-gray-600 font-black uppercase">{activeTFLabel} VWAP</div>
                                            <div className="text-sm font-mono font-bold text-gray-400">${formatPrice(activeLevel.vwap)}</div>
                                        </div>
                                        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-black ${activeLevel.isAbove
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                            }`}>
                                            {activeLevel.isAbove
                                                ? <ArrowUpRight className="w-4 h-4" />
                                                : <ArrowDownRight className="w-4 h-4" />}
                                            {activeLevel.priceVsVwap >= 0 ? '+' : ''}{activeLevel.priceVsVwap.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Multi-TF Heat Strip */}
                                <div className="flex items-center gap-1.5">
                                    {TIMEFRAMES.map(tf => {
                                        const level = profile.levels.find(l => l.timeframe === tf.key);
                                        if (!level) return <div key={tf.key} className="flex-1 h-2 bg-gray-800 rounded-full" />;
                                        return (
                                            <div key={tf.key} className="flex-1 flex flex-col items-center gap-1">
                                                <div className={`w-full h-2 rounded-full transition-all ${level.isAbove ? 'bg-emerald-500' : 'bg-rose-500'
                                                    } ${tf.key === activeTF ? 'ring-2 ring-white/30 ring-offset-1 ring-offset-[#12141c]' : 'opacity-60'}`} />
                                                <span className={`text-[8px] font-black uppercase ${tf.key === activeTF ? 'text-white' : 'text-gray-600'}`}>
                                                    {tf.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div className="ml-3 flex items-center gap-1">
                                        <span className="text-[9px] font-black text-gray-500">{profile.aboveCount}/{profile.levels.length}</span>
                                        <TrendingUp className={`w-3 h-3 ${profile.aboveCount >= 4 ? 'text-emerald-400' : profile.aboveCount >= 2 ? 'text-yellow-400' : 'text-rose-400'}`} />
                                    </div>
                                </div>
                            </button>
                        );
                    })}

                    {filtered.length === 0 && (
                        <div className="text-center py-16">
                            <BarChart3 className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                            <p className="text-gray-500 font-bold text-sm">No tokens {showAboveOnly ? 'above' : 'below'} {activeTFLabel} VWAP</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
