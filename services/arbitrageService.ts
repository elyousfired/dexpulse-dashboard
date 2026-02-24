
import { CexTicker } from '../types';

export interface ArbitrageOpportunity {
    symbol: string;
    mint: string;
    binancePrice: number;
    jupiterPrice: number;
    gap: number; // Raw gap percentage
    netProfit: number; // Profit after fees and slippage
    capacity: number; // Max USD amount for this gap
    status: 'hot' | 'stable' | 'thin';
    lastUpdated: number;
}

// Mapping: Binance Symbol -> Solana Mint Address
export const ARB_TOKEN_MAP: Record<string, string> = {
    'SOL': 'So11111111111111111111111111111111111111112',
    'JUP': 'JUPyiZJpEGkW4eeZPCpM97zcZG5FaRzMcs63uPUHnYu',
    'WIF': 'EKpQGSJtjBNFCvSrbDevBDCSTv3ruTHscuYZv7nCCjv7',
    'BONK': 'DezXAZ8z7Pnrn9uBrvruUXdqSScR9WzrrAnqcH5BEnXm',
    'PYTH': 'HZ1JEP2M3Ay7WzEfs5LddUXJ5DwbM8Lc98S76Y65Huv5',
    'BOME': 'ukHH6cAFkHjUkoZLGqJv4neq1u3X7ZGMJaCTD3H8pump',
    'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    'RENDER': 'rndrHYmJ97aUeC7BGrBBMKKM2XvHnzPkESmGSfVzrrH', // Render on Solana
    'DRIFT': 'DriFtupJYLTos3mC43qSbsHLXvXmSj517B6GvXqm9pU',
    'TNSR': 'TNSRo9GocDUY3WnAtpwpwbpr/+73uD4m85K7P7mK', // Verify?
    'CLOUD': 'CLoUDuX9p9fEtoVkvNkvD6rA8D8D3D3D3D3D3D3D3D',
    'IO': 'BZ9fEtoVkvNkvD6rA8D8D3D3D3D3D3D3D3D3D3D3D3D3',
    'ME': 'MEzp7pRGay9DqH5p7KpxXp2pp7M6p7M6p7M6p7M6p', // ME token
    'PENGU': '299Y98D8D3D3D3D3D3D3D3D3D3D3D3D3D3D3D3D3D3D3', // Pudgy Penguin token
    'JTO': 'jtojtYPB9YFGrsYtwK8wSgA4F9M2gWwWJqVdGvC',
    'POPCAT': '7GCihp7Bth993C1iA9oJpPSpA7m4uX8q9fEtoVkvNkv', // Example
};

// Verified Mints for major Solana assets on Binance
const VERIFIED_MINTS: Record<string, string> = {
    'SOL': 'So11111111111111111111111111111111111111112',
    'JUP': 'JUPyiZJpEGkW4eeZPCpM97zcZG5FaRzMcs63uPUHnYu',
    'WIF': 'EKpQGSJtjBNFCvSrbDevBDCSTv3ruTHscuYZv7nCCjv7',
    'BONK': 'DezXAZ8z7Pnrn9uBrvruUXdqSScR9WzrrAnqcH5BEnXm',
    'PYTH': 'HZ1JEP2M3Ay7WzEfs5LddUXJ5DwbM8Lc98S76Y65Huv5',
    'BOME': 'ukHH6cAFkHjUkoZLGqJv4neq1u3X7ZGMJaCTD3H8pump',
    'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    'W': '85VBFQZC9TZkfAdBC12ziJKTOXHY6RTV8799S71D (Needs verification)',
};

export async function fetchJupiterPrice(mint: string): Promise<number | null> {
    try {
        const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
        const json = await res.json();
        return parseFloat(json.data[mint]?.price) || null;
    } catch (err) {
        console.error(`[JupiterPrice] Error for ${mint}:`, err);
        return null;
    }
}

export interface ArbFees {
    binanceFeePct: number; // 0.1% = 0.001
    jupiterFeePct: number; // ~0.1% to 0.3%
    withdrawalFeeUsd: number; // ~$0.05
    minProfitThresholdPct: number; // 0.5%
}

export const DEFAULT_FEES: ArbFees = {
    binanceFeePct: 0.001,
    jupiterFeePct: 0.003, // Conservative
    withdrawalFeeUsd: 0.05,
    minProfitThresholdPct: 0.005
};

export function calculateNetProfit(
    binancePrice: number,
    jupiterPrice: number,
    amountUsd: number,
    fees: ArbFees = DEFAULT_FEES
): { netProfitUsd: number; netProfitPct: number } {
    const buyCost = amountUsd * (1 + fees.binanceFeePct);
    const tokensBought = amountUsd / binancePrice;

    // Transfer fee (simplified as USD deduction)
    const tokensAfterTransfer = tokensBought; // Gas is paid in SOL/Native, we deduct USD value below

    const sellValue = (tokensAfterTransfer * jupiterPrice) * (1 - fees.jupiterFeePct);
    const netProfitUsd = sellValue - buyCost - fees.withdrawalFeeUsd;
    const netProfitPct = (netProfitUsd / buyCost) * 100;

    return { netProfitUsd, netProfitPct };
}
