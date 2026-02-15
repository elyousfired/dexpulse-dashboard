
/**
 * News Service - Fetches crypto news from free RSS sources via public proxy.
 * Sources: CoinDesk, CoinTelegraph, Decrypt, The Block
 */

export interface NewsItem {
    title: string;
    link: string;
    source: string;
    pubDate: string;
    description: string;
    relatedTokens: string[];
}

const RSS_FEEDS = [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
    { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
];

// Public RSS-to-JSON proxy (free, no API key)
const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

// Token keywords for matching
const TOKEN_KEYWORDS: Record<string, string[]> = {
    BTC: ['bitcoin', 'btc', 'satoshi'],
    ETH: ['ethereum', 'eth', 'vitalik', 'ether'],
    SOL: ['solana', 'sol'],
    BNB: ['binance', 'bnb'],
    XRP: ['ripple', 'xrp'],
    DOGE: ['dogecoin', 'doge'],
    ADA: ['cardano', 'ada'],
    AVAX: ['avalanche', 'avax'],
    DOT: ['polkadot', 'dot'],
    MATIC: ['polygon', 'matic'],
    LINK: ['chainlink', 'link'],
    UNI: ['uniswap', 'uni'],
    PEPE: ['pepe'],
    SHIB: ['shiba', 'shib'],
    ARB: ['arbitrum', 'arb'],
    OP: ['optimism'],
    SUI: ['sui'],
    APT: ['aptos', 'apt'],
    NEAR: ['near'],
    FTM: ['fantom', 'ftm'],
};

function findRelatedTokens(text: string): string[] {
    const lower = text.toLowerCase();
    const matches: string[] = [];
    for (const [token, keywords] of Object.entries(TOKEN_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) {
            matches.push(token);
        }
    }
    return matches;
}

let newsCache: { data: NewsItem[]; ts: number } | null = null;
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchCryptoNews(): Promise<NewsItem[]> {
    if (newsCache && Date.now() - newsCache.ts < NEWS_CACHE_TTL) {
        return newsCache.data;
    }

    const allNews: NewsItem[] = [];

    // Fetch from multiple RSS feeds in parallel
    const results = await Promise.allSettled(
        RSS_FEEDS.map(async (feed) => {
            try {
                const res = await fetch(`${RSS_PROXY}${encodeURIComponent(feed.url)}`);
                if (!res.ok) return [];
                const data = await res.json();
                if (data.status !== 'ok' || !data.items) return [];

                return data.items.map((item: any) => {
                    const fullText = `${item.title} ${item.description || ''}`;
                    return {
                        title: item.title,
                        link: item.link,
                        source: feed.source,
                        pubDate: item.pubDate,
                        description: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 200),
                        relatedTokens: findRelatedTokens(fullText)
                    } as NewsItem;
                });
            } catch (err) {
                console.error(`News fetch error (${feed.source}):`, err);
                return [];
            }
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            allNews.push(...result.value);
        }
    }

    // Sort by date (newest first) and deduplicate
    const sorted = allNews
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, 50);

    newsCache = { data: sorted, ts: Date.now() };
    return sorted;
}
