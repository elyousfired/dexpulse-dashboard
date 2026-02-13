
import React, { useState } from 'react';
import { Search, Loader2, Zap, ChevronDown } from 'lucide-react';

interface ManualScanProps {
    onScan: (address: string, chain: string) => void;
    isScanning: boolean;
}

const SCAN_CHAINS = [
    { id: 'solana', label: 'Solana', emoji: '◎' },
    { id: 'ethereum', label: 'Ethereum', emoji: '⟠' },
    { id: 'bsc', label: 'BSC', emoji: '⛓' },
    { id: 'base', label: 'Base', emoji: '🔵' },
];

export const ManualScan: React.FC<ManualScanProps> = ({ onScan, isScanning }) => {
    const [address, setAddress] = useState('');
    const [chain, setChain] = useState('solana');
    const [showChainDropdown, setShowChainDropdown] = useState(false);

    const selectedChainInfo = SCAN_CHAINS.find(c => c.id === chain)!;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = address.trim();
        if (!trimmed || isScanning) return;
        onScan(trimmed, chain);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setAddress(text.trim());
        } catch {
            // Clipboard API not available
        }
    };

    return (
        <div className="manual-scan">
            <div className="manual-scan-header">
                <Zap className="manual-scan-icon" />
                <div>
                    <h3 className="manual-scan-title">Scan Token</h3>
                    <p className="manual-scan-subtitle">Paste any contract address</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="manual-scan-form">
                {/* Chain selector */}
                <div className="manual-chain-select" onClick={() => setShowChainDropdown(!showChainDropdown)}>
                    <span className="manual-chain-emoji">{selectedChainInfo.emoji}</span>
                    <span className="manual-chain-label">{selectedChainInfo.label}</span>
                    <ChevronDown className="manual-chain-chevron" />

                    {showChainDropdown && (
                        <div className="manual-chain-dropdown">
                            {SCAN_CHAINS.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`manual-chain-option ${chain === c.id ? 'manual-chain-option-active' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setChain(c.id);
                                        setShowChainDropdown(false);
                                    }}
                                >
                                    <span>{c.emoji}</span>
                                    <span>{c.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Address input */}
                <div className="manual-input-wrap">
                    <input
                        type="text"
                        placeholder="Enter token address..."
                        className="manual-input"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        disabled={isScanning}
                    />
                    <button
                        type="button"
                        className="manual-paste-btn"
                        onClick={handlePaste}
                        title="Paste from clipboard"
                    >
                        📋
                    </button>
                </div>

                {/* Scan button */}
                <button
                    type="submit"
                    className={`manual-scan-btn ${isScanning ? 'manual-scan-btn-loading' : ''}`}
                    disabled={!address.trim() || isScanning}
                >
                    {isScanning ? (
                        <>
                            <Loader2 className="manual-scan-btn-icon spin" />
                            Scanning...
                        </>
                    ) : (
                        <>
                            <Search className="manual-scan-btn-icon" />
                            Scan
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};
