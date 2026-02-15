
import React, { useState, useEffect, useCallback } from 'react';
import { fetchCryptoNews, NewsItem } from '../services/newsService';
import {
    Newspaper, ExternalLink, RefreshCw, Loader2, Clock, Tag, Filter,
    TrendingUp, Zap, Globe
} from 'lucide-react';

const SOURCE_COLORS: Record<string, string> = {
    CoinDesk: '#0052ff',
    CoinTelegraph: '#f7931a',
    Decrypt: '#00d395',
};

const TOKEN_COLORS: Record<string, string> = {
    BTC: '#f7931a',
    ETH: '#627eea',
    SOL: '#9945ff',
    BNB: '#f3ba2f',
    XRP: '#23292f',
    DOGE: '#c3a634',
    ADA: '#0033ad',
    AVAX: '#e84142',
    LINK: '#2a5ada',
};

export const NewsFeed: React.FC = () => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('ALL');
    const [error, setError] = useState<string | null>(null);

    const loadNews = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchCryptoNews();
            setNews(data);
        } catch (err) {
            console.error('News fetch error:', err);
            setError('Failed to load news. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadNews(); }, [loadNews]);

    const filteredNews = filter === 'ALL'
        ? news
        : news.filter(n => n.relatedTokens.includes(filter));

    const availableTokens = [...new Set(news.flatMap(n => n.relatedTokens))].sort();

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                        <Newspaper className="w-8 h-8 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Crypto News Feed</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                            <Globe className="w-3 h-3 inline mr-1" />
                            CoinDesk · CoinTelegraph · Decrypt — Live Feed
                        </p>
                    </div>
                </div>
                <button onClick={loadNews} disabled={loading} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 transition-all">
                    <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Token Filter */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-gray-500" />
                <button onClick={() => setFilter('ALL')}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${filter === 'ALL' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
                        }`}>All</button>
                {availableTokens.map(token => (
                    <button key={token} onClick={() => setFilter(token)}
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${filter === token ? 'text-white border' : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
                            }`}
                        style={filter === token ? { backgroundColor: `${TOKEN_COLORS[token] || '#666'}30`, borderColor: `${TOKEN_COLORS[token] || '#666'}60`, color: TOKEN_COLORS[token] || '#aaa' } : {}}>
                        {token}
                    </button>
                ))}
            </div>

            {/* News List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <span className="ml-3 text-sm text-gray-500 font-bold">Loading news from sources...</span>
                </div>
            ) : error ? (
                <div className="text-center py-20">
                    <p className="text-rose-400 font-bold text-sm">{error}</p>
                    <button onClick={loadNews} className="mt-4 px-6 py-2 bg-gray-800 text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-700 transition-all">Retry</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredNews.map((item, idx) => (
                        <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer"
                            className="group bg-[#12141c] rounded-2xl border border-gray-800 p-5 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.05)] flex flex-col">

                            {/* Source + Time */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SOURCE_COLORS[item.source] || '#666' }}></div>
                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: SOURCE_COLORS[item.source] || '#666' }}>
                                        {item.source}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-gray-600">
                                    <Clock className="w-3 h-3" />
                                    <span className="text-[10px] font-bold">{timeAgo(item.pubDate)}</span>
                                </div>
                            </div>

                            {/* Title */}
                            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors leading-snug mb-3 flex-1">
                                {item.title}
                            </h3>

                            {/* Description */}
                            <p className="text-[11px] text-gray-500 leading-relaxed mb-4 line-clamp-2">
                                {item.description}
                            </p>

                            {/* Footer: tokens + link */}
                            <div className="flex items-center justify-between mt-auto">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {item.relatedTokens.length > 0 ? (
                                        item.relatedTokens.slice(0, 4).map(token => (
                                            <span key={token} className="px-2 py-0.5 rounded-full text-[9px] font-black border"
                                                style={{
                                                    backgroundColor: `${TOKEN_COLORS[token] || '#666'}15`,
                                                    borderColor: `${TOKEN_COLORS[token] || '#666'}40`,
                                                    color: TOKEN_COLORS[token] || '#aaa'
                                                }}>
                                                {token}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-[9px] text-gray-600 font-bold">General</span>
                                    )}
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-cyan-400 transition-colors" />
                            </div>
                        </a>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && filteredNews.length === 0 && (
                <div className="text-center py-16">
                    <Newspaper className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-500 font-bold text-sm">No news found for "{filter}"</p>
                    <button onClick={() => setFilter('ALL')} className="mt-3 text-cyan-400 text-xs font-bold hover:underline">Show all news</button>
                </div>
            )}
        </div>
    );
};
