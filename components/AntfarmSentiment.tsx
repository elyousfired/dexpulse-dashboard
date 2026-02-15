
import React, { useState, useEffect } from 'react';
import { CexTicker } from '../types';
import { fetchAntfarmSentiment, SentimentData, getHybridSignal } from '../services/sentimentService';
import { Users, MessageSquare, AlertTriangle, TrendingUp, Radar, ShieldCheck, Zap, Activity, Loader2 } from 'lucide-react';

interface AntfarmSentimentProps {
    tickers: CexTicker[];
    onTickerClick: (ticker: CexTicker) => void;
}

export const AntfarmSentiment: React.FC<AntfarmSentimentProps> = ({ tickers, onTickerClick }) => {
    const [sentimentMap, setSentimentMap] = useState<Record<string, SentimentData>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSentiment = async () => {
            setLoading(true);
            const data: Record<string, SentimentData> = {};
            const topTickers = tickers.slice(0, 40); // Focus on top volume

            await Promise.all(topTickers.map(async (t) => {
                const res = await fetchAntfarmSentiment(t.symbol);
                data[t.id] = res;
            }));

            setSentimentMap(data);
            setLoading(false);
        };
        loadSentiment();
    }, [tickers.length > 0 ? 1 : 0]);

    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-emerald-500/10 shadow-2xl overflow-hidden">
            {/* Sentiment Header */}
            <div className="p-6 bg-gradient-to-r from-emerald-900/10 via-[#0d0f14] to-blue-900/10 border-b border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                        <Users className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Sentiment (Antfarm)</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Researcher Agent Connection: Active</span>
                        </div>
                    </div>
                </div>
                {loading && <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />}
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tickers.slice(0, 30).map(ticker => {
                        const sentiment = sentimentMap[ticker.id];
                        if (!sentiment) return null;

                        const signal = getHybridSignal(ticker, sentiment);

                        return (
                            <button
                                key={ticker.id}
                                onClick={() => onTickerClick(ticker)}
                                className="relative group bg-[#12141c] border border-gray-800 rounded-[32px] p-6 text-left transition-all hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/5 overflow-hidden"
                            >
                                {/* Hybrid Badge */}
                                {signal === 'SUPER_SIGNAL' && (
                                    <div className="absolute top-0 right-0 p-3 bg-emerald-500 text-white rounded-bl-3xl flex items-center gap-1 shadow-lg animate-bounce">
                                        <Zap size={14} fill="currentColor" />
                                        <span className="text-[10px] font-black uppercase">Alpha Boost</span>
                                    </div>
                                )}
                                {signal === 'BOT_WARNING' && (
                                    <div className="absolute top-0 right-0 p-3 bg-rose-500 text-white rounded-bl-3xl flex items-center gap-1 shadow-lg">
                                        <AlertTriangle size={14} fill="currentColor" />
                                        <span className="text-[10px] font-black uppercase">Bot Alert</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center font-black text-white text-lg">
                                        {ticker.symbol[0]}
                                    </div>
                                    <div>
                                        <div className="text-base font-black text-white leading-none">{ticker.symbol}/USDT</div>
                                        <div className="text-[10px] text-gray-600 font-bold uppercase mt-1 tracking-wider inline-flex items-center gap-1">
                                            <TrendingUp size={10} className={ticker.priceChangePercent24h >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
                                            {ticker.priceChangePercent24h.toFixed(2)}% (24h)
                                        </div>
                                    </div>
                                </div>

                                {/* Sentiment Score Bar */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                                <Radar size={12} className="text-emerald-400" /> Sentiment Score
                                            </span>
                                            <span className={`text-sm font-black ${sentiment.score > 70 ? 'text-emerald-400' : 'text-gray-400'}`}>
                                                {sentiment.score}/100
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full bg-gray-800/50 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${sentiment.score > 70 ? 'bg-emerald-500' : 'bg-gray-600'}`}
                                                style={{ width: `${sentiment.score}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Bot Activity Indicator */}
                                    <div className="flex items-center justify-between p-3 bg-black/40 rounded-2xl border border-white/5">
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck size={14} className={sentiment.botActivity < 20 ? 'text-emerald-500' : 'text-yellow-500'} />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Organic Trust</span>
                                        </div>
                                        <span className={`text-[10px] font-black uppercase ${sentiment.botActivity < 20 ? 'text-emerald-500' : 'text-yellow-500'}`}>
                                            {100 - sentiment.botActivity}%
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2 border-t border-white/5 opacity-50">
                                        <MessageSquare size={12} className="text-gray-600" />
                                        <span className="text-[9px] font-bold text-gray-400 uppercase italic truncate">
                                            "{sentiment.verdict}"
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-emerald-500/10 bg-emerald-900/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                        Neural Correlation: Social Sentiment Agent (v2.1)
                    </span>
                </div>
            </div>
        </div>
    );
};
