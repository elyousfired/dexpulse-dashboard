
import React from 'react';
import { ExternalLink, TrendingUp, Droplets, BarChart3, Clock } from 'lucide-react';
import { TokenScanResult } from '../types';
import { TokenMiniChart } from './TokenMiniChart';

interface TokenCardProps {
    result: TokenScanResult;
    onClick: () => void;
}

export const TokenCard: React.FC<TokenCardProps> = ({ result, onClick }) => {
    const { token, riskScore, scanStatus, security } = result;

    const getRiskColor = () => {
        if (riskScore >= 50) return 'risk-danger';
        if (riskScore >= 25) return 'risk-warning';
        return 'risk-safe';
    };

    const getRiskLabel = () => {
        if (riskScore >= 50) return 'DANGER';
        if (riskScore >= 25) return 'CAUTION';
        return 'SAFE';
    };

    const formatCurrency = (val: number | null) => {
        if (val === null) return '—';
        if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(2)}K`;
        return `$${val.toFixed(2)}`;
    };

    const formatPrice = (val: number | null) => {
        if (val === null) return '—';
        if (val < 0.0001) return `$${val.toExponential(3)}`;
        return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    };

    // Calculate circumference for the SVG ring
    const circleRadius = 28;
    const circumference = 2 * Math.PI * circleRadius;
    const scoreOffset = circumference - (riskScore / 100) * circumference;

    return (
        <div className={`token-card ${getRiskColor()}`} onClick={onClick}>
            {/* Scanning overlay */}
            {scanStatus === 'scanning' && (
                <div className="card-scanning-overlay">
                    <div className="scanning-bar" />
                </div>
            )}

            {/* Top Row: Token Info + Risk Ring */}
            <div className="card-top">
                <div className="card-token-info">
                    <div className="card-token-avatar">
                        {token.icon ? (
                            <img src={token.icon} alt={token.symbol} className="card-avatar-img" />
                        ) : (
                            <span className="card-avatar-text">
                                {token.symbol.substring(0, 2).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div>
                        <div className="card-token-name">
                            <span className="card-symbol">{token.symbol}</span>
                            {token.rawBoost.amount > 1000 && (
                                <span className="card-hot-badge">🔥 HOT</span>
                            )}
                        </div>
                        <span className="card-fullname">{token.name}</span>
                        <span className="card-chain">{token.chainId}</span>
                    </div>
                </div>

                {/* Risk Score Ring */}
                <div className="card-risk-ring">
                    <svg viewBox="0 0 64 64" className="ring-svg">
                        <circle cx="32" cy="32" r={circleRadius} className="ring-bg" />
                        <circle
                            cx="32" cy="32" r={circleRadius}
                            className={`ring-progress ${getRiskColor()}`}
                            strokeDasharray={circumference}
                            strokeDashoffset={scoreOffset}
                            transform="rotate(-90 32 32)"
                        />
                    </svg>
                    <div className="ring-label">
                        <span className={`ring-score ${getRiskColor()}`}>{riskScore}</span>
                        <span className="ring-max">/100</span>
                    </div>
                    <span className={`risk-badge ${getRiskColor()}`}>{getRiskLabel()}</span>
                </div>
            </div>

            {/* Price */}
            <div className="card-price">{formatPrice(token.priceUsd)}</div>

            {/* Mini Chart Preview */}
            {token.pairAddress && token.chainId && (
                <TokenMiniChart
                    pairAddress={token.pairAddress}
                    chainId={token.chainId}
                    color={riskScore < 25 ? '#10b981' : riskScore < 50 ? '#f59e0b' : '#ef4444'}
                />
            )}

            {/* Stats Grid */}
            <div className="card-stats">
                <div className="card-stat">
                    <Droplets className="card-stat-icon" />
                    <span className="card-stat-label">Liquidity</span>
                    <span className="card-stat-value">{formatCurrency(token.liquidityUsd)}</span>
                </div>
                <div className="card-stat">
                    <BarChart3 className="card-stat-icon" />
                    <span className="card-stat-label">Vol 24h</span>
                    <span className="card-stat-value card-stat-green">{formatCurrency(token.volume24h)}</span>
                </div>
                <div className="card-stat">
                    <Clock className="card-stat-icon" />
                    <span className="card-stat-label">Age</span>
                    <span className="card-stat-value">{token.ageInHours !== null ? `${token.ageInHours}h` : '—'}</span>
                </div>
            </div>

            {/* Security Quick Flags */}
            {security && (
                <div className="card-flags">
                    {security.isHoneypot === true && <span className="flag flag-danger">🍯 Honeypot</span>}
                    {security.isHoneypot === false && <span className="flag flag-safe">✅ Not Honeypot</span>}
                    {security.hasMintAuthority === true && <span className="flag flag-warning">⚠️ Mintable</span>}
                    {security.isOpenSource === true && <span className="flag flag-safe">📖 Verified</span>}
                    {security.isOpenSource === false && <span className="flag flag-danger">🔒 Unverified</span>}
                    {security.lpLocked === true && <span className="flag flag-safe">🔐 LP Locked</span>}
                </div>
            )}

            {/* Footer */}
            <div className="card-footer">
                <a
                    href={token.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-link"
                    onClick={e => e.stopPropagation()}
                >
                    <ExternalLink className="card-link-icon" />
                    Dexscreener
                </a>
                <span className="card-address mono">{token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}</span>
            </div>
        </div>
    );
};
