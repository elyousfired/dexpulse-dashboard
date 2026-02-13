
import React, { useRef, useEffect } from 'react';
import { Bot, Radio, Power, ChevronDown } from 'lucide-react';
import { AgentLog } from '../types';

interface AgentStatusPanelProps {
    logs: AgentLog[];
    isAutoScan: boolean;
    onToggleAutoScan: () => void;
    selectedChain: string;
    onChainChange: (chain: string) => void;
    agentState: 'idle' | 'scanning' | 'alert';
}

const CHAINS = [
    { id: 'all', label: 'All Chains', emoji: '🌐' },
    { id: 'solana', label: 'Solana', emoji: '◎' },
    { id: 'ethereum', label: 'Ethereum', emoji: '⟠' },
    { id: 'bsc', label: 'BSC', emoji: '⛓' },
    { id: 'base', label: 'Base', emoji: '🔵' },
];

export const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({
    logs,
    isAutoScan,
    onToggleAutoScan,
    selectedChain,
    onChainChange,
    agentState,
}) => {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const getLogColor = (type: AgentLog['type']) => {
        switch (type) {
            case 'danger': return 'log-danger';
            case 'warning': return 'log-warning';
            case 'success': return 'log-success';
            case 'scan': return 'log-scan';
            default: return 'log-info';
        }
    };

    const getLogIcon = (type: AgentLog['type']) => {
        switch (type) {
            case 'danger': return '🚨';
            case 'warning': return '⚠️';
            case 'success': return '✅';
            case 'scan': return '🔍';
            default: return '💡';
        }
    };

    return (
        <aside className="agent-panel">
            {/* Agent Header */}
            <div className="agent-header">
                <div className="agent-title-row">
                    <Bot className="agent-bot-icon" />
                    <div>
                        <h2 className="agent-title">AI Agent</h2>
                        <span className={`agent-state agent-state-${agentState}`}>
                            {agentState === 'scanning' ? 'Scanning' : agentState === 'alert' ? 'Alert!' : 'Idle'}
                        </span>
                    </div>
                </div>
                <button
                    onClick={onToggleAutoScan}
                    className={`autoscan-btn ${isAutoScan ? 'autoscan-active' : 'autoscan-inactive'}`}
                    title={isAutoScan ? 'Disable auto-scan' : 'Enable auto-scan'}
                >
                    <Power className="autoscan-icon" />
                </button>
            </div>

            {/* Chain Selector */}
            <div className="chain-selector">
                <label className="chain-label">
                    <Radio className="chain-label-icon" />
                    Network
                </label>
                <div className="chain-grid">
                    {CHAINS.map(chain => (
                        <button
                            key={chain.id}
                            onClick={() => onChainChange(chain.id)}
                            className={`chain-btn ${selectedChain === chain.id ? 'chain-btn-active' : ''}`}
                        >
                            <span>{chain.emoji}</span>
                            <span className="chain-btn-label">{chain.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Activity Feed */}
            <div className="agent-feed">
                <h3 className="feed-title">Activity Feed</h3>
                <div className="feed-scroll">
                    {logs.length === 0 ? (
                        <div className="feed-empty">
                            <Bot className="feed-empty-icon" />
                            <p>No activity yet...</p>
                            <p className="feed-empty-hint">Enable auto-scan to start</p>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className={`feed-item ${getLogColor(log.type)}`}>
                                <span className="feed-item-icon">{getLogIcon(log.type)}</span>
                                <div className="feed-item-content">
                                    <p className="feed-item-msg">{log.message}</p>
                                    <span className="feed-item-time">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={logEndRef} />
                </div>
            </div>
        </aside>
    );
};
