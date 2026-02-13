
import { TokenSecurityInfo, NormalizedTokenItem } from '../types';

export async function generateTokenSummary(
    token: NormalizedTokenItem,
    security: TokenSecurityInfo,
    riskScore: number
): Promise<string> {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY
        || (typeof process !== 'undefined' && (process as any).env?.GEMINI_API_KEY)
        || '';

    if (!apiKey) {
        return generateFallbackVerdict(token, security, riskScore);
    }

    try {
        const prompt = buildPrompt(token, security, riskScore);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        maxOutputTokens: 150,
                        temperature: 0.3,
                    },
                }),
            }
        );

        if (!response.ok) {
            console.warn('[AIAgent] Gemini API error, using fallback');
            return generateFallbackVerdict(token, security, riskScore);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text?.trim() || generateFallbackVerdict(token, security, riskScore);
    } catch (error) {
        console.error('[AIAgent] Error generating summary:', error);
        return generateFallbackVerdict(token, security, riskScore);
    }
}

function buildPrompt(
    token: NormalizedTokenItem,
    security: TokenSecurityInfo,
    riskScore: number
): string {
    return `You are a crypto security analyst AI. Analyze this token and give a 2-sentence verdict.

Token: ${token.symbol} (${token.name})
Chain: ${token.chainId}
Price: $${token.priceUsd || 'unknown'}
Liquidity: $${token.liquidityUsd || 'unknown'}
Volume 24h: $${token.volume24h || 'unknown'}
Age: ${token.ageInHours ? token.ageInHours + ' hours' : 'unknown'}
Risk Score: ${riskScore}/100

Security Analysis:
- Honeypot: ${security.isHoneypot === null ? 'Unknown' : security.isHoneypot ? 'YES ⚠️' : 'No ✅'}
- Mint Authority: ${security.hasMintAuthority === null ? 'Unknown' : security.hasMintAuthority ? 'YES ⚠️' : 'No ✅'}
- Freeze Authority: ${security.hasFreezeAuthority === null ? 'Unknown' : security.hasFreezeAuthority ? 'YES ⚠️' : 'No ✅'}
- Open Source: ${security.isOpenSource === null ? 'Unknown' : security.isOpenSource ? 'Yes ✅' : 'NO ⚠️'}
- Top 10 Holders: ${security.topHolderPercent !== null ? security.topHolderPercent.toFixed(1) + '%' : 'Unknown'}
- Buy Tax: ${security.buyTax !== null ? security.buyTax + '%' : 'N/A'}
- Sell Tax: ${security.sellTax !== null ? security.sellTax + '%' : 'N/A'}
- LP Locked: ${security.lpLocked === null ? 'Unknown' : security.lpLocked ? 'Yes ✅' : 'NO ⚠️'}

Give a concise 2-sentence verdict. First sentence about safety. Second about recommendation. Be direct and specific.`;
}

function generateFallbackVerdict(
    token: NormalizedTokenItem,
    security: TokenSecurityInfo,
    riskScore: number
): string {
    const warnings: string[] = [];
    const positives: string[] = [];

    if (security.isHoneypot === true) warnings.push('honeypot detected');
    if (security.hasMintAuthority === true) warnings.push('mint authority active');
    if (security.hasFreezeAuthority === true) warnings.push('freeze authority enabled');
    if (security.isOpenSource === false) warnings.push('contract not verified');
    if (security.topHolderPercent !== null && security.topHolderPercent > 50)
        warnings.push(`top holders control ${security.topHolderPercent.toFixed(0)}%`);
    if (security.sellTax !== null && security.sellTax > 10)
        warnings.push(`high sell tax (${security.sellTax}%)`);
    if (security.lpLocked === false) warnings.push('liquidity not locked');

    if (security.isHoneypot === false) positives.push('not a honeypot');
    if (security.isOpenSource === true) positives.push('contract verified');
    if (security.lpLocked === true) positives.push('LP locked');
    if (security.topHolderPercent !== null && security.topHolderPercent < 30)
        positives.push('healthy holder distribution');

    if (riskScore >= 50) {
        return `⚠️ HIGH RISK (${riskScore}/100): ${warnings.length > 0 ? warnings.join(', ') : 'multiple red flags detected'}. Exercise extreme caution — this token shows significant danger signals.`;
    } else if (riskScore >= 25) {
        return `⚡ MODERATE RISK (${riskScore}/100): ${warnings.length > 0 ? 'Concerns: ' + warnings.join(', ') : 'Some risk factors present'}. ${positives.length > 0 ? 'Positives: ' + positives.join(', ') + '.' : 'DYOR before investing.'}`;
    } else {
        return `✅ LOW RISK (${riskScore}/100): ${positives.length > 0 ? positives.join(', ') : 'No major red flags detected'}. Token appears relatively safe, but always DYOR.`;
    }
}
