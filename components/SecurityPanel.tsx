
import React from 'react';
import { X, ShieldCheck, ShieldAlert, ShieldX, ExternalLink, Bot } from 'lucide-react';
import { TokenScanResult } from '../types';
import { TokenChart } from './TokenChart';

interface SecurityPanelProps {
    result: TokenScanResult;
    onClose: () => void;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({ result, onClose }) => {
    const { token, security, riskScore, aiVerdict, scanStatus } = result;
    const [activeAudit, setActiveAudit] = React.useState<string | null>(null);
    const [startedAudits, setStartedAudits] = React.useState<Record<string, string>>({});

    const getRiskColor = () => {
        if (riskScore >= 50) return 'risk-danger';
        if (riskScore >= 25) return 'risk-warning';
        return 'risk-safe';
    };

    const formatCurrency = (val: number | null) => {
        if (val === null) return '—';
        if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(2)}K`;
        return `$${val.toFixed(2)}`;
    };

    const formatPrice = (val: number | null) => {
        if (val === null) return '—';
        if (val < 0.0001) return `$${val.toExponential(4)}`;
        return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    };

    const handleDeepAudit = async (workflow: string) => {
        setActiveAudit(workflow);
        try {
            const taskMap: Record<string, string> = {
                'security-audit': `Perform deep security audit for token ${token.symbol} (${token.tokenAddress}) on ${token.chainId}. Focus on contract vulnerabilities and holder distribution.`,
                'sentiment-analysis': `Analyze social sentiment and bot activity for token ${token.symbol} on ${token.chainId}.`,
                'whale-tracker': `Track whale activity and large wallet movements for token ${token.symbol} on ${token.chainId}.`
            };

            const response = await fetch('http://localhost:3001/api/antfarm/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflow,
                    task: taskMap[workflow] || `Research ${token.symbol}`
                })
            });
            const data = await response.json();
            if (data.runId) {
                setStartedAudits(prev => ({ ...prev, [workflow]: data.runId }));
            }
        } catch (error) {
            console.error('Audit failed to start:', error);
        } finally {
            setActiveAudit(null);
        }
    };

    type CheckResult = 'pass' | 'fail' | 'warn' | 'unknown';

    const getCheckStatus = (value: boolean | null, invert = false): CheckResult => {
        if (value === null) return 'unknown';
        const result = invert ? !value : value;
        return result ? 'pass' : 'fail';
    };

    const CheckIcon: React.FC<{ status: CheckResult }> = ({ status }) => {
        switch (status) {
            case 'pass': return <ShieldCheck className="check-icon check-pass" />;
            case 'fail': return <ShieldX className="check-icon check-fail" />;
            case 'warn': return <ShieldAlert className="check-icon check-warn" />;
            default: return <span className="check-icon check-unknown">?</span>;
        }
    };

    const securityChecks = security ? [
        {
            label: 'Honeypot Detection',
            status: security.isHoneypot === null ? 'unknown' as CheckResult :
                security.isHoneypot ? 'fail' as CheckResult : 'pass' as CheckResult,
            detail: security.isHoneypot === true ? 'HONEYPOT DETECTED' :
                security.isHoneypot === false ? 'Not a honeypot' : 'Unable to verify',
        },
        {
            label: 'Contract Verified',
            status: getCheckStatus(security.isOpenSource),
            detail: security.isOpenSource ? 'Source code verified' :
                security.isOpenSource === false ? 'Contract not verified' : 'Unable to verify',
        },
        {
            label: 'Mint Authority',
            status: security.hasMintAuthority === null ? 'unknown' as CheckResult :
                security.hasMintAuthority ? 'fail' as CheckResult : 'pass' as CheckResult,
            detail: security.hasMintAuthority ? 'Can mint new tokens' :
                security.hasMintAuthority === false ? 'No mint authority' : 'Unable to verify',
        },
        {
            label: 'Freeze Authority',
            status: security.hasFreezeAuthority === null ? 'unknown' as CheckResult :
                security.hasFreezeAuthority ? 'fail' as CheckResult : 'pass' as CheckResult,
            detail: security.hasFreezeAuthority ? 'Can freeze accounts' :
                security.hasFreezeAuthority === false ? 'No freeze authority' : 'Unable to verify',
        },
        {
            label: 'Liquidity Locked',
            status: getCheckStatus(security.lpLocked),
            detail: security.lpLocked ? 'LP tokens locked' :
                security.lpLocked === false ? 'Liquidity NOT locked' : 'Unable to verify',
        },
        {
            label: 'Holder Distribution',
            status: security.topHolderPercent === null ? 'unknown' as CheckResult :
                security.topHolderPercent > 50 ? 'fail' as CheckResult :
                    security.topHolderPercent > 30 ? 'warn' as CheckResult : 'pass' as CheckResult,
            detail: security.topHolderPercent !== null
                ? `Top 10 holders: ${security.topHolderPercent.toFixed(1)}%`
                : 'Unable to verify',
        },
    ] : [];

    return (
        <div className="security-overlay" onClick={onClose}>
            <div className="security-panel" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="security-header">
                    <div className="security-token-info">
                        {token.icon && <img src={token.icon} className="security-avatar" alt="" />}
                        <div>
                            <h2 className="security-token-name">{token.symbol}</h2>
                            <div className="security-token-meta">
                                <span className="mono">{token.name}</span>
                                <span>•</span>
                                <span className="mono security-price">{formatPrice(token.priceUsd)}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="security-close-btn">
                        <X className="security-close-icon" />
                    </button>
                </div>

                <div className="security-body">
                    {/* Risk Score Bar */}
                    <div className="risk-score-section">
                        <div className="risk-score-header">
                            <span className="risk-score-title">Risk Assessment</span>
                            <span className={`risk-score-value ${getRiskColor()}`}>{riskScore}/100</span>
                        </div>
                        <div className="risk-bar-track">
                            <div
                                className={`risk-bar-fill ${getRiskColor()}`}
                                style={{ width: `${riskScore}%` }}
                            />
                        </div>
                        <div className="risk-bar-labels">
                            <span>Safe</span>
                            <span>Moderate</span>
                            <span>Danger</span>
                        </div>
                    </div>

                    {/* AI Verdict */}
                    {aiVerdict && (
                        <div className="ai-verdict-section">
                            <div className="ai-verdict-header">
                                <Bot className="ai-verdict-icon" />
                                <span>AI Verdict</span>
                            </div>
                            <p className="ai-verdict-text">{aiVerdict}</p>
                        </div>
                    )}

                    {/* Key Stats */}
                    <div className="security-stats-grid">
                        <div className="security-stat">
                            <span className="security-stat-label">Liquidity</span>
                            <span className="security-stat-value">{formatCurrency(token.liquidityUsd)}</span>
                        </div>
                        <div className="security-stat">
                            <span className="security-stat-label">Volume 24h</span>
                            <span className="security-stat-value security-stat-green">{formatCurrency(token.volume24h)}</span>
                        </div>
                        <div className="security-stat">
                            <span className="security-stat-label">Age</span>
                            <span className="security-stat-value">{token.ageInHours !== null ? `${token.ageInHours}h` : '—'}</span>
                        </div>
                        {security?.buyTax !== null && security?.buyTax !== undefined && (
                            <div className="security-stat">
                                <span className="security-stat-label">Buy Tax</span>
                                <span className="security-stat-value">{security.buyTax}%</span>
                            </div>
                        )}
                        {security?.sellTax !== null && security?.sellTax !== undefined && (
                            <div className="security-stat">
                                <span className="security-stat-label">Sell Tax</span>
                                <span className={`security-stat-value ${(security.sellTax || 0) > 10 ? 'security-stat-red' : ''}`}>
                                    {security.sellTax}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Security Checklist */}
                    <div className="security-checklist">
                        <h3 className="checklist-title">Security Analysis</h3>
                        {securityChecks.map((check, i) => (
                            <div key={i} className={`checklist-item checklist-${check.status}`}>
                                <CheckIcon status={check.status} />
                                <div className="checklist-info">
                                    <span className="checklist-label">{check.label}</span>
                                    <span className="checklist-detail">{check.detail}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    <div className="security-chart">
                        <h3 className="chart-section-title">Price & Volume Chart</h3>
                        <div className="chart-container">
                            <TokenChart
                                address={token.tokenAddress}
                                symbol={token.symbol}
                                pairAddress={token.pairAddress}
                                chainId={token.chainId}
                            />
                        </div>
                    </div>

                    {/* AI Intelligence Cluster */}
                    <div className="security-checklist" style={{ border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <h3 className="checklist-title" style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bot size={14} /> Antfarm AI Intelligence
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                            <button
                                onClick={() => handleDeepAudit('security-audit')}
                                disabled={!!activeAudit || !!startedAudits['security-audit']}
                                className="security-link-btn"
                                style={{
                                    background: startedAudits['security-audit'] ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-elevated)',
                                    color: startedAudits['security-audit'] ? 'var(--accent-green)' : 'white',
                                    border: `1px solid ${startedAudits['security-audit'] ? 'var(--accent-green)' : 'var(--border-color)'}`,
                                    fontSize: '11px', padding: '8px'
                                }}
                            >
                                <Bot size={14} />
                                {startedAudits['security-audit'] ? 'Audit Running' : 'Security Audit'}
                            </button>
                            <button
                                onClick={() => handleDeepAudit('sentiment-analysis')}
                                disabled={!!activeAudit || !!startedAudits['sentiment-analysis']}
                                className="security-link-btn"
                                style={{
                                    background: startedAudits['sentiment-analysis'] ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-elevated)',
                                    color: startedAudits['sentiment-analysis'] ? 'var(--accent-green)' : 'white',
                                    border: `1px solid ${startedAudits['sentiment-analysis'] ? 'var(--accent-green)' : 'var(--border-color)'}`,
                                    fontSize: '11px', padding: '8px'
                                }}
                            >
                                <Bot size={14} />
                                {startedAudits['sentiment-analysis'] ? 'Sentiment OK' : 'Sentiment Analysis'}
                            </button>
                            <button
                                onClick={() => handleDeepAudit('whale-tracker')}
                                disabled={!!activeAudit || !!startedAudits['whale-tracker']}
                                className="security-link-btn"
                                style={{
                                    background: startedAudits['whale-tracker'] ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-elevated)',
                                    color: startedAudits['whale-tracker'] ? 'var(--accent-green)' : 'white',
                                    border: `1px solid ${startedAudits['whale-tracker'] ? 'var(--accent-green)' : 'var(--border-color)'}`,
                                    fontSize: '11px', padding: '8px',
                                    gridColumn: 'span 2'
                                }}
                            >
                                <Bot size={14} />
                                {startedAudits['whale-tracker'] ? 'Tracking Whales' : 'Whale Movement Tracker'}
                            </button>
                        </div>
                    </div>

                    {/* Links */}
                    <div className="security-links">
                        <a
                            href={token.url}
                            target="_blank"
                            rel="noreferrer"
                            className="security-link-btn"
                        >
                            <ExternalLink className="security-link-icon" />
                            View on Dexscreener
                        </a>
                        <a
                            href={`https://solscan.io/token/${token.tokenAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            className="security-link-btn security-link-secondary"
                        >
                            <ExternalLink className="security-link-icon" />
                            Explorer
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
