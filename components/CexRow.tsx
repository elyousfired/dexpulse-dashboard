
import React, { useEffect, useRef, useState } from 'react';
import { CexTicker } from '../types';
import { formatLargeNumber, formatPrice } from '../services/cexService';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface CexRowProps {
    ticker: CexTicker;
    index: number;
    onClick: (ticker: CexTicker) => void;
}

export const CexRow: React.FC<CexRowProps> = React.memo(({ ticker, index, onClick }) => {
    const [flash, setFlash] = useState<'up' | 'down' | null>(null);
    const prevPriceRef = useRef<number>(ticker.priceUsd);
    const isPositive = ticker.priceChangePercent24h >= 0;

    useEffect(() => {
        if (prevPriceRef.current !== ticker.priceUsd) {
            setFlash(ticker.priceUsd > prevPriceRef.current ? 'up' : 'down');
            prevPriceRef.current = ticker.priceUsd;

            const timer = setTimeout(() => setFlash(null), 800);
            return () => clearTimeout(timer);
        }
    }, [ticker.priceUsd]);

    const rangePercent = ticker.high24h !== ticker.low24h
        ? ((ticker.priceUsd - ticker.low24h) / (ticker.high24h - ticker.low24h)) * 100
        : 50;

    return (
        <tr
            className={`cex-row ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}
            onClick={() => onClick(ticker)}
            style={{ cursor: 'pointer' }}
        >
            <td className="cex-td cex-td-rank">{index + 1}</td>
            <td className="cex-td cex-td-token">
                <div className="cex-token-badge">
                    <span className="cex-token-symbol">{ticker.symbol}</span>
                    <span className="cex-token-pair">/USDT</span>
                </div>
                <span className="cex-exchange-tag">{ticker.exchange}</span>
            </td>
            <td className={`cex-td cex-td-price mono ${flash === 'up' ? 'text-green' : flash === 'down' ? 'text-red' : ''}`}>
                ${formatPrice(ticker.priceUsd)}
            </td>
            <td className={`cex-td cex-td-change ${isPositive ? 'cex-green' : 'cex-red'}`}>
                <div className="cex-change-cell">
                    {isPositive ? <TrendingUp className="cex-change-icon" /> : <TrendingDown className="cex-change-icon" />}
                    <span className="mono">{isPositive ? '+' : ''}{ticker.priceChangePercent24h.toFixed(2)}%</span>
                </div>
            </td>
            <td className="cex-td cex-td-range">
                <div className="cex-range">
                    <span className="cex-range-val mono">${formatPrice(ticker.low24h)}</span>
                    <div className="cex-range-bar">
                        <div className="cex-range-track">
                            <div
                                className={`cex-range-fill ${isPositive ? 'cex-range-green' : 'cex-range-red'}`}
                                style={{ width: `${Math.max(2, Math.min(98, rangePercent))}%` }}
                            />
                            <div
                                className="cex-range-dot"
                                style={{ left: `${Math.max(2, Math.min(98, rangePercent))}%` }}
                            />
                        </div>
                    </div>
                    <span className="cex-range-val mono">${formatPrice(ticker.high24h)}</span>
                </div>
            </td>
            <td className="cex-td cex-td-volume mono">${formatLargeNumber(ticker.volume24h)}</td>
        </tr>
    );
});
