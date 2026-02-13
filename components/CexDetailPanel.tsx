
import React, { useEffect, useState } from 'react';
import { CexTicker } from '../types';
import { TokenChart } from './TokenChart';
import { CexAiAnalysis } from './CexAiAnalysis';
import { fetchBinanceKlines, formatLargeNumber, formatPrice } from '../services/cexService';
import { X, ExternalLink, TrendingUp, TrendingDown, Globe } from 'lucide-react';

interface CexDetailPanelProps {
    ticker: CexTicker;
    onClose: () => void;
}

export const CexDetailPanel: React.FC<CexDetailPanelProps> = ({ ticker, onClose }) => {
    const isPositive = ticker.priceChangePercent24h >= 0;
    const [ohlcvData, setOhlcvData] = useState<any[]>([]);

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

                            <div className="flex-1 min-h-[550px] bg-[#0c1017] rounded-2xl border border-[#1e2638] overflow-hidden">
                                <TokenChart
                                    symbol={ticker.symbol}
                                    isCex={true}
                                    address={ticker.id}
                                />
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
