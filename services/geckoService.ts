
// Network mapping for GeckoTerminal
const NETWORK_MAP: Record<string, string> = {
    solana: 'solana',
    ethereum: 'eth',
    bsc: 'bsc',
    base: 'base',
    arbitrum: 'arbitrum',
    polygon: 'polygon_pos',
};

export interface GeckoOHLCV {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export async function fetchGeckoOHLCV(
    chain: string,
    pairAddress: string,
    timeframe: 'day' | 'hour' | 'minute',
    aggregate: number = 1
): Promise<GeckoOHLCV[]> {
    const network = NETWORK_MAP[chain.toLowerCase()] || chain;
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pairAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=100`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 429) throw new Error('Rate limit exceeded');
            throw new Error(`GeckoTerminal error: ${res.status}`);
        }

        const json = await res.json();
        const list = json.data?.attributes?.ohlcv_list;

        if (!list || !Array.isArray(list)) return [];

        // format: [timestamp, open, high, low, close, volume]
        return list.map((item: number[]) => ({
            time: item[0],
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4],
            volume: item[5],
        })).reverse(); // Gecko returns newest first usually, verify? 
        // Actually Lightweight charts expects items sorted by time ascending.
        // Gecko returns newest first (descending). So we MUST reverse.
    } catch (err) {
        console.error('GeckoTerminal fetch failed:', err);
        return [];
    }
}
