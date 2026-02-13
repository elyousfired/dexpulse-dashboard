
import { HeliusTokenMetadata } from '../types';

const HELIUS_API_KEY = '4dd6a8a9-5f58-432a-a44c-2c74ff329f5b';
const HELIUS_RPC = `/api/helius-rpc/?api-key=${HELIUS_API_KEY}`;

export async function fetchHeliusMetadata(mintAddress: string): Promise<HeliusTokenMetadata | null> {
    try {
        const response = await fetch(HELIUS_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'getAsset',
                params: { id: mintAddress }
            }),
        });

        if (!response.ok) throw new Error(`Helius API error ${response.status}`);

        const data = await response.json();
        const asset = data.result;

        if (!asset) return null;

        // Parse Digital Asset Standard (DAS) response
        return {
            onChain: true,
            verifyStatus: asset.burnt ? 'verified' : 'unknown', // Simplified mapping
            creators: asset.creators?.map((c: any) => ({
                address: c.address,
                share: c.share,
                verified: c.verified
            })) || [],
            sellerFeeBasisPoints: asset.royalty?.basis_points || 0,
            primarySaleHappened: asset.royalty?.primary_sale_happened || false,
            isMutable: asset.mutable,
            tokenStandard: asset.token_info?.token_program || 'unknown',
        };
    } catch (error) {
        console.error('Helius metadata fetch failed:', error);
        return null;
    }
}

export async function getSolanaTPS(): Promise<number | null> {
    try {
        const response = await fetch(HELIUS_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'perf',
                method: 'getRecentPerformanceSamples',
                params: [1]
            }),
        });

        const data = await response.json();
        const sample = data.result?.[0];

        if (sample && sample.numTransactions && sample.samplePeriodSecs) {
            return Math.round(sample.numTransactions / sample.samplePeriodSecs);
        }
        return null;
    } catch {
        return null;
    }
}
