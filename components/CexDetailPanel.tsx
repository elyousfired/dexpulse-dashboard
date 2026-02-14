import React, { useEffect, useState } from 'react';
import { CexTicker } from '../types';
import { TokenChart } from './TokenChart';
import { CexAiAnalysis } from './CexAiAnalysis';
import { ScriptEditor } from './ScriptEditor';
import { fetchBinanceKlines, formatLargeNumber, formatPrice } from '../services/cexService';
import { X, ExternalLink, TrendingUp, TrendingDown, Globe, Code, BarChart2, Zap } from 'lucide-react';

interface CexDetailPanelProps {
    ticker: CexTicker;
    onClose: () => void;
}

export const CexDetailPanel: React.FC<CexDetailPanelProps> = ({ ticker, onClose }) => {
    const isPositive = ticker.priceChangePercent24h >= 0;
    const [ohlcvData, setOhlcvData] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'price' | 'flow'>('price');
    const [customScript, setCustomScript] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);

    // Prevent background scroll when open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'auto'; };
    }, []);

    // Fetch initial OHLCV for AI context
    useEffect(() => {
        const load = async () => {
            const data = await fetchBinanceKlines(ticker.symbol, '15m', 50);
            setOhlcvData(data);
        };
        load();
    }, [ticker.symbol]);

    return (
        <div className="security-panel-overlay" onClick={onClose}>
            <div className="security-panel" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="security-header">
                    <div className="security-header-left">
                        <div className="security-token-brand">
                            <div className="token-icon-wrap">
                                <span className="text-xl font-bold text-white">{ticker.symbol[0]}</span>
                            </div>
                            <div>
                                <h2 className="security-title">{ticker.symbol} / USDT</h2>
                                <span className="security-subtitle">{ticker.exchange} Spot Market</span>
                            </div>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </header>

                <div className="security-content">
                    <div className="cex-detail-grid-v2">
                        {/* Column 1: Primary (Price Stats + Chart) - EXPANDED */}
                        <div className="flex flex-col gap-6">
                            <div className="security-stats-grid">
                                <div className="stat-card">
                                    <span className="stat-label">Current Price</span>
                                    <div className="stat-value-wrap">
                                        <span className="stat-value text-white">${formatPrice(ticker.priceUsd)}</span>
                                        <span className={`stat-change ${isPositive ? 'text-green' : 'text-red'}`}>
                                            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                            {ticker.priceChangePercent24h.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-label">24h Volume</span>
                                    <div className="stat-value text-white">${formatLargeNumber(ticker.volume24h)}</div>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-label">24h High/Low</span>
                                    <div className="stat-value text-sm text-white">
                                        H: ${formatPrice(ticker.high24h)}<br />
                                        L: ${formatPrice(ticker.low24h)}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 min-h-[550px] bg-[#0c1017] rounded-2xl border border-[#1e2638] overflow-hidden flex flex-col">
                                {/* Chart Sub-Header / Tabs */}
                                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#161b22]/50">
                                    <div className="flex gap-1 bg-[#0d1117] p-1 rounded-lg border border-gray-800">
                                        <button
                                            onClick={() => setActiveTab('price')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'price' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            <BarChart2 size={14} />
                                            Price Chart
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('flow')}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'flow' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            <Zap size={14} />
                                            Liquidity Flow
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setShowEditor(!showEditor)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${showEditor ? 'bg-purple-600/20 border-purple-500 text-purple-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                                    >
                                        <Code size={14} />
                                        {showEditor ? 'Hide Editor' : 'Indicator Lab'}
                                    </button>
                                </div>

                                <div className="flex-1 flex min-h-0">
                                    <div className={`flex-1 transition-all ${showEditor ? 'w-2/3' : 'w-full'}`}>
                                        <TokenChart
                                            symbol={ticker.symbol}
                                            isCex={true}
                                            address={ticker.id}
                                            activeView={activeTab}
                                            customScript={customScript}
                                        />
                                    </div>
                                    {showEditor && (
                                        <div className="w-1/3 border-l border-gray-800 animate-in slide-in-from-right duration-300">
                                            <ScriptEditor
                                                initialScript={`// Indicator Lab Template\n// Variables: data, close, open, high, low, volume, buyVolume, sellVolume, netFlow\n\nreturn close.map((c, i) => {\n  // Example: Simple 5-candle average\n  const slice = close.slice(Math.max(0, i-4), i+1);\n  return slice.reduce((a, b) => a + b, 0) / slice.length;\n});`}
                                                onApply={(script) => setCustomScript(script)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Column 2: AI Analysis & Market Details */}
                        <div className="flex flex-col gap-6">
                            <CexAiAnalysis ticker={ticker} ohlcvData={ohlcvData} />

                            <div className="security-section">
                                <h3 className="security-section-title">Market Context</h3>
                                <div className="risk-details-grid">
                                    <div className="risk-detail-item">
                                        <span className="risk-label">Trading Pair</span>
                                        <span className="risk-value">{ticker.pair}</span>
                                    </div>
                                    <div className="risk-detail-item">
                                        <span className="risk-label">Exchange</span>
                                        <span className="risk-value">{ticker.exchange}</span>
                                    </div>
                                    <div className="risk-detail-item">
                                        <span className="risk-label">Quote Asset</span>
                                        <span className="risk-value">USDT</span>
                                    </div>
                                    <div className="risk-detail-item">
                                        <span className="risk-label">Data Status</span>
                                        <span className="risk-value text-green">Real-time</span>
                                    </div>
                                </div>
                            </div>

                            <div className="security-section">
                                <h3 className="security-section-title">Quick Links</h3>
                                <div className="security-links-grid">
                                    <a href={`https://www.binance.com/en/trade/${ticker.symbol}_USDT`} target="_blank" className="sec-link-btn" rel="noreferrer">
                                        <ExternalLink size={14} />
                                        Trade on Binance
                                    </a>
                                    <a href={`https://coinmarketcap.com/currencies/${ticker.symbol.toLowerCase()}/`} target="_blank" className="sec-link-btn" rel="noreferrer">
                                        <Globe size={14} />
                                        CoinMarketCap
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
