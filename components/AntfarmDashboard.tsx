import React from 'react';
import { Bot, ExternalLink, Terminal, ShieldAlert } from 'lucide-react';

export const AntfarmDashboard: React.FC = () => {
    return (
        <div className="antfarm-container">
            <div className="antfarm-header">
                <div className="antfarm-brand">
                    <div className="antfarm-icon-wrap">
                        <Bot className="antfarm-bot-icon" />
                    </div>
                    <div>
                        <h2 className="antfarm-title">Antfarm AI Agent Team</h2>
                        <p className="antfarm-subtitle">Autonomous workflow orchestration for deep security audits</p>
                    </div>
                </div>

                <div className="antfarm-actions">
                    <a
                        href="http://localhost:3333"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="antfarm-external-link"
                    >
                        <span>Open in New Tab</span>
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            <div className="antfarm-content">
                <div className="antfarm-iframe-wrapper">
                    <iframe
                        src="http://localhost:3333"
                        title="Antfarm Dashboard"
                        className="antfarm-iframe"
                    />
                </div>

                <div className="antfarm-sidebar">
                    <div className="antfarm-card">
                        <h3 className="card-title">
                            <Terminal size={16} />
                            Active Agents
                        </h3>
                        <div className="agent-list">
                            <div className="agent-item">
                                <div className="agent-avatar">P</div>
                                <div>
                                    <div className="agent-name">Planner</div>
                                    <div className="agent-status-tag">Ready</div>
                                </div>
                            </div>
                            <div className="agent-item">
                                <div className="agent-avatar">D</div>
                                <div>
                                    <div className="agent-name">Developer</div>
                                    <div className="agent-status-tag">Ready</div>
                                </div>
                            </div>
                            <div className="agent-item">
                                <div className="agent-avatar">V</div>
                                <div>
                                    <div className="agent-name">Verifier</div>
                                    <div className="agent-status-tag">Ready</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="antfarm-card card-danger">
                        <h3 className="card-title">
                            <ShieldAlert size={16} />
                            Security Protocol
                        </h3>
                        <p className="card-text">
                            Agents are authorized to scan contracts and simulate transactions in isolated environments.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
