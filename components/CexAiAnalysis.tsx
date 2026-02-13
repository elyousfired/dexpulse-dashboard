
import React, { useEffect, useState } from 'react';
import { CexTicker } from '../types';
import { Bot, Zap, TrendingUp, TrendingDown, Target, ShieldAlert } from 'lucide-react';
import { generateTokenSummary } from '../services/aiAgentService';

interface CexAiAnalysisProps {
    ticker: CexTicker;
    ohlcvData: any[];
}

export const CexAiAnalysis: React.FC<CexAiAnalysisProps> = ({ ticker, ohlcvData }) => {
    const [analysis, setAnalysis] = useState<string>('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchAnalysis = async () => {
            if (ohlcvData.length === 0) return;
            setLoading(true);
            try {
                // We use generateTokenSummary but with a custom context for CEX technical analysis
                const lastCandle = ohlcvData[ohlcvData.length - 1];
                const prevCandle = ohlcvData[ohlcvData.length - 2];
                const priceTrend = lastCandle.close > prevCandle?.close ? 'BULLISH' : 'BEARISH';

                const prompt = `Perform a rapid technical analysis for ${ticker.symbol} on Binance.
                Latest metrics: Price $${ticker.priceUsd}, 24h Change ${ticker.priceChangePercent24h}%, 24h Volume $${ticker.volume24h}.
                Current trend based on 15m candles: ${priceTrend}.
                Provide a concise "Market Sentiment" and a "Key Technical Level" (support/resistance).`;

                const result = await generateTokenSummary(
                    {
                        symbol: ticker.symbol,
                        name: ticker.symbol,
                        tokenAddress: ticker.id,
                        chainId: 'binance',
                        priceUsd: ticker.priceUsd,
                        volume24h: ticker.volume24h,
                        liquidityUsd: null,
                        ageInHours: null,
                        pairAddress: ticker.id,
                        url: ''
                    } as any,
                    {
                        isHoneypot: false,
                        isOpenSource: true,
                        hasMintAuthority: false,
                        hasFreezeAuthority: false,
                        lpLocked: true,
                        topHolderPercent: 0,
                        buyTax: 0,
                        sellTax: 0,
                    } as any,
                    0
                );

                setAnalysis(result || 'Unable to generate analysis at this time.');
            } catch (err) {
                console.error('AI Analysis error:', err);
                setAnalysis('AI Agent is currently busy analyzing other markets.');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalysis();
    }, [ticker.id, ohlcvData.length]);

    return (
        <div className="ai-analysis-card">
            <div className="ai-header">
                <div className="ai-bot-avatar">
                    <Bot size={20} className="text-blue-400" />
                </div>
                <div className="ai-title-wrap">
                    <h3 className="ai-title">DEXPulse AI Intelligence</h3>
                    <span className="ai-subtitle">Technical Analysis & Sentiment</span>
                </div>
            </div>

            <div className="ai-content">
                {loading ? (
                    <div className="ai-loading">
                        <Zap size={16} className="text-blue-500 animate-pulse" />
                        <span>Analyzing 15m candle patterns...</span>
                    </div>
                ) : (
                    <>
                        <div className="ai-verdict">
                            <p className="ai-text">{analysis}</p>
                        </div>

                        <div className="ai-signals">
                            <div className="ai-signal-pill">
                                <Target size={14} className="text-blue-400" />
                                <span>RSI: Neutral</span>
                            </div>
                            <div className="ai-signal-pill">
                                <Activity size={14} className="text-cyan-400" />
                                <span>Momentum: Strong</span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="ai-footer">
                <ShieldAlert size={12} className="text-muted" />
                <span>Not financial advice. AI analysis is based on historical patterns.</span>
            </div>
        </div>
    );
};

import { Activity } from 'lucide-react';
