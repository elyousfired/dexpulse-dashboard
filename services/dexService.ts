
import { DexBoostedToken, DexPair, NormalizedTokenItem } from '../types';

const CACHE_KEY = 'dex_boosted_cache';
const CACHE_DURATION = 15000; // 15 seconds

interface CacheEntry {
  timestamp: number;
  data: NormalizedTokenItem[];
}

export async function fetchLatestBoostedTokens(): Promise<NormalizedTokenItem[]> {
  // Check Cache
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const entry: CacheEntry = JSON.parse(cached);
    if (Date.now() - entry.timestamp < CACHE_DURATION) {
      console.log('Serving from cache...');
      return entry.data;
    }
  }

  try {
    // 1. Fetch boosted tokens
    const boostedResponse = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    if (!boostedResponse.ok) throw new Error('Failed to fetch boosted tokens');
    const boostedData: DexBoostedToken[] = await boostedResponse.json();

    // To provide a better UI, we attempt to fetch details for these tokens.
    // Dexscreener allows fetching up to 30 addresses at once via /latest/dex/tokens/:addresses
    // We'll process the first 30 for performance and rate-limit safety.
    const topTokens = boostedData.slice(0, 30);
    const addresses = topTokens.map(t => t.tokenAddress).join(',');
    
    let pairDataMap: Record<string, DexPair> = {};
    
    if (addresses) {
      const pairResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses}`);
      if (pairResponse.ok) {
        const pData = await pairResponse.json();
        if (pData.pairs) {
          pData.pairs.forEach((pair: DexPair) => {
            // Keep the one with highest liquidity as the primary representative for the token
            const existing = pairDataMap[pair.baseToken.address];
            if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
              pairDataMap[pair.baseToken.address] = pair;
            }
          });
        }
      }
    }

    // 2. Normalize data
    const normalized: NormalizedTokenItem[] = boostedData.map(boost => {
      const pair = pairDataMap[boost.tokenAddress];
      const now = Date.now();
      const ageHours = pair?.pairCreatedAt 
        ? Math.floor((now - pair.pairCreatedAt) / (1000 * 60 * 60)) 
        : null;

      return {
        id: `${boost.chainId}-${boost.tokenAddress}`,
        chainId: boost.chainId,
        tokenAddress: boost.tokenAddress,
        pairAddress: pair?.pairAddress || '',
        symbol: pair?.baseToken?.symbol || 'Unknown',
        name: pair?.baseToken?.name || 'Unknown Token',
        priceUsd: pair?.priceUsd ? parseFloat(pair.priceUsd) : null,
        liquidityUsd: pair?.liquidity?.usd || null,
        volume24h: pair?.volume?.h24 || null,
        url: boost.url || pair?.url || '#',
        icon: boost.icon,
        ageInHours: ageHours,
        rawBoost: boost
      };
    });

    // Save Cache
    const newCache: CacheEntry = { timestamp: Date.now(), data: normalized };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));

    return normalized;
  } catch (error) {
    console.error('DexService Error:', error);
    throw error;
  }
}
