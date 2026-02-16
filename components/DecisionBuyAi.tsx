
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CexTicker } from '../types';
import { fetchWeeklyVwapData, VwapData, formatPrice } from '../services/cexService';
import { Brain, Star, TrendingUp, Info, ArrowRight, Zap, Trophy, ShieldCheck, Bell, Settings, Send, CheckCircle, XCircle, Volume2, VolumeX, Timer, Filter } from 'lucide-react';
import { sendGoldenSignalAlert, wasAlertedToday, loadTelegramConfig, saveTelegramConfig, sendTestAlert, TelegramConfig } from '../services/telegramService';

interface DecisionBuyAiProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
    onAddToWatchlist: (ticker: CexTicker) => void;
}

interface BuySignal {
    ticker: CexTicker;
    vwap: VwapData;
    score: number;
    reason: string;
    type: 'GOLDEN' | 'MOMENTUM' | 'SUPPORT';
    activeSince?: number; // timestamp
}

export const DecisionBuyAi: React.FC<DecisionBuyAiProps> = ({ tickers, onTickerClick, onAddToWatchlist }) => {
    const [vwapStore, setVwapStore] = useState<Record<string, VwapData>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [tgConfig, setTgConfig] = useState<TelegramConfig>(loadTelegramConfig);
    const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
    const [alertCount, setAlertCount] = useState(0);
    const [audioEnabled, setAudioEnabled] = useState(() => {
        const saved = localStorage.getItem('dexpulse_audio_alerts');
        return saved ? saved === 'true' : true;
    });
    const [sortBy, setSortBy] = useState<'score' | 'time'>('score');
    const alertedRef = useRef<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [firstSeenTimes, setFirstSeenTimes] = useState<Record<string, number>>({});
    const [currentTime, setCurrentTime] = useState(Date.now());

    // Live timer update
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audioRef.current.volume = 0.5;
    }, []);

    useEffect(() => {
        localStorage.setItem('dexpulse_audio_alerts', audioEnabled.toString());
    }, [audioEnabled]);

    const playAlarm = () => {
        if (!audioEnabled || !audioRef.current) return;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.warn("Audio play blocked by browser. Interaction required.", e));
    };

    useEffect(() => {
        const loadVwapData = async () => {
            setIsLoading(true);
            const results: Record<string, VwapData> = {};
            // Scan top 100 for signals
            const targetSymbols = tickers.slice(0, 100);

            const CHUNK_SIZE = 10;
            for (let i = 0; i < targetSymbols.length; i += CHUNK_SIZE) {
                const chunk = targetSymbols.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (t) => {
                    const data = await fetchWeeklyVwapData(t.symbol);
                    if (data) results[t.id] = data;
                }));
            }
            setVwapStore(results);
            setIsLoading(false);
        };
        loadVwapData();
    }, [tickers.length > 0]);

    const signals = useMemo(() => {
        return tickers.map(t => {
            const vwap = vwapStore[t.id];
            if (!vwap) return null;

            const price = t.priceUsd;
            let signal: BuySignal | null = null;
            const isMonday = new Date().getUTCDay() === 1;

            // ─── GOLDEN SIGNAL LOGIC ───
            // Monday: Price > Max && Min && Mid (Daily)
            // Other Days: Price > Max && Min
            const isGoldenMonday = isMonday && price > vwap.max && price > vwap.min && price > vwap.mid;
            const isGoldenStandard = !isMonday && price > vwap.max && price > vwap.min;

            if (isGoldenMonday || isGoldenStandard) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 95 + Math.min(5, t.priceChangePercent24h / 10),
                    reason: isMonday
                        ? "Monday Elite: Price above Weekly Max, Min and Daily VWAP. Strong weekly opening."
                        : "Golden Breakout: Price confirmed above Weekly Max and Min levels.",
                    activeSince: firstSeenTimes[t.id] || Date.now(),
                    type: 'GOLDEN'
                };
            }
            // 2. MOMENTUM PUSH: Price > Mid && Price < Max && Price rising
            else if (price > vwap.mid && price < vwap.max && t.priceChangePercent24h > 2) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 85 + Math.min(10, t.priceChangePercent24h / 5),
                    reason: "Entering momentum zone. High potential for Max retest.",
                    type: 'MOMENTUM'
                };
            }
            // 3. SUPPORT BOUNCE: Price approx Mid && Pos change
            else if (Math.abs(price - vwap.mid) / vwap.mid < 0.02 && t.priceChangePercent24h > 0) {
                signal = {
                    ticker: t,
                    vwap,
                    score: 80,
                    reason: "Bouncing off Weekly Mid support. Safe entry point.",
                    type: 'SUPPORT'
                };
            }

            return signal;
        })
            .filter((s): s is BuySignal => s !== null)
            .sort((a, b) => {
                if (sortBy === 'time') {
                    const aTime = a.activeSince || 0;
                    const bTime = b.activeSince || 0;
                    return bTime - aTime; // Newest first
                }
                return b.score - a.score;
            });
    }, [tickers, vwapStore, firstSeenTimes, sortBy]);

    // ─── TRACK FIRST SEEN TIMES ───────────────────
    useEffect(() => {
        const currentGoldenIds = new Set(
            tickers
                .filter(t => {
                    const vwap = vwapStore[t.id];
                    if (!vwap) return false;
                    const isMonday = new Date().getUTCDay() === 1;
                    return isMonday
                        ? (t.priceUsd > vwap.max && t.priceUsd > vwap.min && t.priceUsd > vwap.mid)
                        : (t.priceUsd > vwap.max && t.priceUsd > vwap.min);
                })
                .map(t => t.id)
        );

        setFirstSeenTimes(prev => {
            const next = { ...prev };
            let changed = false;

            // Add new ones
            currentGoldenIds.forEach(id => {
                if (!next[id]) {
                    next[id] = Date.now();
                    changed = true;
                }
            });

            // Remove lost ones
            Object.keys(next).forEach(id => {
                if (!currentGoldenIds.has(id)) {
                    delete next[id];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [tickers, vwapStore]);

    // ─── Telegram Alert Trigger ───────────────────
    useEffect(() => {
        if (!tgConfig.enabled) return;

        const currentGoldenSymbols = new Set(signals.filter(s => s.type === 'GOLDEN').map(s => s.ticker.symbol));
        const allActiveSymbols = new Set(signals.map(s => s.ticker.symbol));

        let sent = 0;
        signals.forEach(sig => {
            const symbol = sig.ticker.symbol;

            if (sig.type === 'GOLDEN') {
                if (!alertedRef.current.has(symbol)) {
                    sendGoldenSignalAlert({
                        symbol,
                        price: sig.ticker.priceUsd,
                        change24h: sig.ticker.priceChangePercent24h,
                        score: sig.score,
                        vwapMax: sig.vwap.max,
                        vwapMid: sig.vwap.mid,
                        reason: sig.reason,
                        type: sig.type
                    });
                    playAlarm();
                    alertedRef.current.add(symbol);
                    sent++;
                }
            } else {
                // Not golden: if it was alerted before, clear it so it can re-trigger
                if (alertedRef.current.has(symbol)) {
                    alertedRef.current.delete(symbol);
                }
            }
        });

        // Cleanup: tokens that completely fell out of signals
        alertedRef.current.forEach(symbol => {
            if (!allActiveSymbols.has(symbol)) {
                alertedRef.current.delete(symbol);
            }
        });

        if (sent > 0) setAlertCount(prev => prev + sent);
    }, [signals, tgConfig.enabled, audioEnabled]);

    const handleSaveConfig = (config: TelegramConfig) => {
        saveTelegramConfig(config);
        setTgConfig(config);
    };

    const handleTestAlert = async () => {
        setTestStatus('sending');
        const ok = await sendTestAlert(tgConfig);
        setTestStatus(ok ? 'ok' : 'fail');
        setTimeout(() => setTestStatus('idle'), 3000);
    };

    if (isLoading && Object.keys(vwapStore).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-gray-500 gap-4">
                <Brain className="w-12 h-12 text-purple-500 animate-pulse" />
                <p className="text-sm font-black tracking-widest uppercase">AI Engine Analyzing Buy Signals...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-purple-500/20 shadow-[0_0_50px_rgba(168,85,247,0.05)] overflow-hidden">
            {/* AI Header */}
            <div className="p-6 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-2xl border border-purple-500/30">
                        <Brain className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-white uppercase italic">Decision Buy AI</h2>
                        <p className="text-xs text-purple-400/60 font-medium font-mono lowercase">Predictive breakout & support engine v1.0</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-black/40 rounded-xl p-1 border border-purple-500/20 mr-2">
                        <button
                            onClick={() => setSortBy('score')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${sortBy === 'score' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Trophy className="w-3 h-3" />
                            SCORE
                        </button>
                        <button
                            onClick={() => setSortBy('time')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${sortBy === 'time' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Timer className="w-3 h-3" />
                            TIME
                        </button>
                    </div>

                    <button onClick={() => setShowSettings(!showSettings)}
                        className={`p-3 rounded-xl border transition-all ${showSettings ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white'}`}>
                        <Settings className={`w-5 h-5 ${showSettings ? 'animate-spin-slow' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Telegram Settings Panel */}
            {showSettings && (
                <div className="p-5 bg-[#0a0c10] border-b border-gray-800">
                    <div className="flex items-center gap-2 mb-4">
                        <Settings className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">Telegram Alerts</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Bot Token</label>
                            <input type="password" placeholder="123456:ABC-DEF1234ghIkl..." value={tgConfig.botToken}
                                onChange={e => handleSaveConfig({ ...tgConfig, botToken: e.target.value })}
                                className="w-full bg-black/60 text-white text-sm font-mono px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">Chat ID</label>
                            <input type="text" placeholder="-1001234567890" value={tgConfig.chatId}
                                onChange={e => handleSaveConfig({ ...tgConfig, chatId: e.target.value })}
                                className="w-full bg-black/60 text-white text-sm font-mono px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-10 h-5 rounded-full relative transition-all ${tgConfig.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
                                onClick={() => handleSaveConfig({ ...tgConfig, enabled: !tgConfig.enabled })}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${tgConfig.enabled ? 'left-5.5' : 'left-0.5'}`}></div>
                            </div>
                            <span className="text-xs font-bold text-gray-400">{tgConfig.enabled ? 'Alerts ON' : 'Alerts OFF'}</span>
                        </label>
                        <button onClick={handleTestAlert} disabled={!tgConfig.botToken || !tgConfig.chatId || testStatus === 'sending'}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl text-[10px] font-black uppercase hover:bg-purple-600 hover:text-white transition-all disabled:opacity-30">
                            {testStatus === 'sending' ? <Send className="w-3 h-3 animate-pulse" /> :
                                testStatus === 'ok' ? <CheckCircle className="w-3 h-3 text-emerald-400" /> :
                                    testStatus === 'fail' ? <XCircle className="w-3 h-3 text-rose-400" /> :
                                        <Send className="w-3 h-3" />}
                            {testStatus === 'ok' ? 'Sent!' : testStatus === 'fail' ? 'Failed' : 'Test Alert'}
                        </button>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setAudioEnabled(!audioEnabled)}
                                className={`p-2 rounded-lg border transition-all ${audioEnabled ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                            >
                                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                            <div>
                                <h4 className="text-[10px] font-black text-white uppercase">Audio Alarm</h4>
                                <p className="text-[9px] text-gray-500 font-bold uppercase">Sound on Golden Signal</p>
                            </div>
                        </div>
                        <button
                            onClick={playAlarm}
                            className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all"
                        >
                            Test Sound
                        </button>
                    </div>
                    <p className="text-[9px] text-gray-600 mt-3 font-bold">Create a bot via @BotFather on Telegram. Get Chat ID via @userinfobot.</p>
                </div>
            )}

            {/* Signal List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {signals.map((sig) => (
                        <button
                            key={sig.ticker.id}
                            onClick={() => onTickerClick(sig.ticker)}
                            className="group relative flex flex-col p-5 bg-[#12141c] rounded-2xl border border-gray-800 hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.1)] active:scale-[0.99]"
                        >
                            {/* Score Badge */}
                            <div className="absolute top-4 right-4 flex flex-col items-end">
                                <div className="text-[10px] font-black text-gray-500 uppercase mb-1">Buy Score</div>
                                <div className="flex items-center gap-2">
                                    <Trophy className={`w-4 h-4 ${sig.score > 90 ? 'text-yellow-500' : 'text-purple-400'}`} />
                                    <span className="text-2xl font-black text-white italic">{sig.score.toFixed(0)}</span>
                                </div>
                                {sig.type === 'GOLDEN' && sig.activeSince && (
                                    <span className="text-[9px] font-black text-amber-500/70 mt-1 uppercase tracking-tighter bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                                        ⏱️ {Math.floor((currentTime - sig.activeSince) / 1000 / 60)}m {Math.floor((currentTime - sig.activeSince) / 1000) % 60}s
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${sig.type === 'GOLDEN' ? 'bg-yellow-500 text-black' :
                                    sig.type === 'MOMENTUM' ? 'bg-purple-600 text-white' :
                                        'bg-blue-600 text-white'
                                    }`}>
                                    {sig.ticker.symbol[0]}
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white group-hover:text-purple-400 transition-colors uppercase tracking-tighter">
                                        {sig.ticker.symbol} / USDT
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${sig.type === 'GOLDEN' ? 'bg-yellow-500/20 text-yellow-500' :
                                            sig.type === 'MOMENTUM' ? 'bg-purple-500/20 text-purple-400' :
                                                'bg-blue-500/20 text-blue-400'
                                            }`}>
                                            {sig.type} SIGNAL
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/40 rounded-xl p-4 border border-white/5 mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                                    <span className="text-xs font-black text-gray-300 uppercase tracking-widest">AI Verdict</span>
                                </div>
                                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                                    {sig.reason}
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Price</span>
                                    <span className="text-sm font-mono font-bold text-white">${formatPrice(sig.ticker.priceUsd)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Target (Max)</span>
                                    <span className="text-sm font-mono font-bold text-green-400">${formatPrice(sig.vwap.max)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase mb-1">Stop (Mid)</span>
                                    <span className="text-sm font-mono font-bold text-rose-400">${formatPrice(sig.vwap.mid)}</span>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddToWatchlist(sig.ticker);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 text-blue-400 border border-blue-600/20 rounded-xl text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all"
                                >
                                    <Star className="w-3 h-3" />
                                    ADD TO WATCHLIST
                                </button>
                                <div className="flex items-center gap-1 text-purple-400 font-black text-xs group-hover:gap-2 transition-all uppercase">
                                    Investigate <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {signals.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-500 italic">
                        <Zap className="w-12 h-12 opacity-10 mb-4" />
                        <p>Scanning markets for low-risk buying opportunities...</p>
                    </div>
                )}
            </div>

            {/* Footer Notice */}
            <div className="p-4 bg-purple-900/5 border-t border-purple-500/10 flex items-center gap-3">
                <Info className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    AI Signals are for educational purposes. Always verify Liquidity Flow & CVD before entering a trade.
                </span>
            </div>
        </div>
    );
};
