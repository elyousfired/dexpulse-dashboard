
import { TokenSecurityInfo } from '../types';

const GOPLUS_BASE = 'https://api.gopluslabs.io/api/v1';

// Chain ID mapping for GoPlus API
const CHAIN_MAP: Record<string, string> = {
    solana: 'solana',
    ethereum: '1',
    eth: '1',
    bsc: '56',
    base: '8453',
    arbitrum: '42161',
    polygon: '137',
};

export async function analyzeTokenSecurity(
    address: string,
    chain: string
): Promise<TokenSecurityInfo> {
    const chainId = CHAIN_MAP[chain.toLowerCase()] || chain;

    try {
        if (chainId === 'solana') {
            return await analyzeSolanaToken(address);
        } else {
            return await analyzeEvmToken(address, chainId);
        }
    } catch (error) {
        console.error(`[SecurityService] Error analyzing ${address} on ${chain}:`, error);
        return createEmptySecurity();
    }
}

async function analyzeSolanaToken(address: string): Promise<TokenSecurityInfo> {
    const response = await fetch(
        `${GOPLUS_BASE}/solana/token_security?contract_addresses=${address}`
    );

    if (!response.ok) return createEmptySecurity();

    const json = await response.json();
    const data = json?.result?.[address.toLowerCase()] || json?.result?.[address];

    if (!data) return createEmptySecurity();

    const topHolders = data.holders || [];
    const topHolderPercent = topHolders.length > 0
        ? topHolders.slice(0, 10).reduce((sum: number, h: any) => sum + parseFloat(h.percent || '0'), 0) * 100
        : null;

    return {
        isHoneypot: null, // Solana doesn't have classic honeypots
        hasMintAuthority: data.mutable_metadata === '1' || data.mintable === '1',
        hasFreezeAuthority: data.freezeable === '1',
        isOpenSource: data.is_open_source === '1',
        topHolderPercent,
        creatorPercent: data.creator_percentage ? parseFloat(data.creator_percentage) * 100 : null,
        lpLocked: data.lp_holders ? data.lp_holders.some((lp: any) => lp.is_locked === 1) : null,
        buyTax: null,
        sellTax: null,
        rawData: data,
    };
}

async function analyzeEvmToken(address: string, chainId: string): Promise<TokenSecurityInfo> {
    const response = await fetch(
        `${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${address}`
    );

    if (!response.ok) return createEmptySecurity();

    const json = await response.json();
    const data = json?.result?.[address.toLowerCase()];

    if (!data) return createEmptySecurity();

    const topHolders = data.holders || [];
    const topHolderPercent = topHolders.length > 0
        ? topHolders.slice(0, 10).reduce((sum: number, h: any) => sum + parseFloat(h.percent || '0'), 0) * 100
        : null;

    return {
        isHoneypot: data.is_honeypot === '1',
        hasMintAuthority: data.is_mintable === '1',
        hasFreezeAuthority: null,
        isOpenSource: data.is_open_source === '1',
        topHolderPercent,
        creatorPercent: data.creator_percent ? parseFloat(data.creator_percent) * 100 : null,
        lpLocked: data.lp_holders ? data.lp_holders.some((lp: any) => lp.is_locked === 1) : null,
        buyTax: data.buy_tax ? parseFloat(data.buy_tax) * 100 : null,
        sellTax: data.sell_tax ? parseFloat(data.sell_tax) * 100 : null,
        rawData: data,
    };
}

function createEmptySecurity(): TokenSecurityInfo {
    return {
        isHoneypot: null,
        hasMintAuthority: null,
        hasFreezeAuthority: null,
        isOpenSource: null,
        topHolderPercent: null,
        creatorPercent: null,
        lpLocked: null,
        buyTax: null,
        sellTax: null,
    };
}

// ─── Risk Score Engine ──────────────────────────────

export function computeRiskScore(
    security: TokenSecurityInfo,
    liquidityUsd: number | null,
    volume24h: number | null,
    ageInHours: number | null
): number {
    let score = 0;

    // Honeypot = instant danger
    if (security.isHoneypot === true) score += 40;

    // Mint authority = high risk
    if (security.hasMintAuthority === true) score += 15;

    // Freeze authority = high risk
    if (security.hasFreezeAuthority === true) score += 10;

    // Not open source = medium risk
    if (security.isOpenSource === false) score += 10;

    // High holder concentration
    if (security.topHolderPercent !== null) {
        if (security.topHolderPercent > 80) score += 15;
        else if (security.topHolderPercent > 50) score += 10;
        else if (security.topHolderPercent > 30) score += 5;
    }

    // High taxes
    if (security.buyTax !== null && security.buyTax > 10) score += 5;
    if (security.sellTax !== null && security.sellTax > 10) score += 10;

    // Low liquidity
    if (liquidityUsd !== null) {
        if (liquidityUsd < 1000) score += 10;
        else if (liquidityUsd < 5000) score += 5;
    } else {
        score += 5;
    }

    // Very new (< 1h)
    if (ageInHours !== null && ageInHours < 1) score += 5;

    // LP not locked
    if (security.lpLocked === false) score += 5;

    return Math.min(100, Math.max(0, score));
}

export function riskScoreToStatus(score: number): 'safe' | 'warning' | 'danger' {
    if (score >= 50) return 'danger';
    if (score >= 25) return 'warning';
    return 'safe';
}
