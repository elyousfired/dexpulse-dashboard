
import { CexTicker, VwapData } from '../types';

export interface EcosystemGroup {
    name: string;
    symbol: string;
    color: string;
    gradient: string;
    iconName?: string;
    tokens: CexTicker[];
    powerScore: number;
    momentum: 'Bullish' | 'Neutral' | 'Bearish';
    capitalFlow: number;
    leader?: CexTicker;
    lagger?: CexTicker;
}

export function getEcosystemsWithTickers(tickers: CexTicker[], vwapStore: Record<string, VwapData>): EcosystemGroup[] {
    const ecosystems: EcosystemGroup[] = [
        {
            name: 'Ethereum Ecosystem', symbol: 'ETH', color: 'text-blue-400',
            gradient: 'from-blue-600/20 to-indigo-600/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        },
        {
            name: 'Solana Ecosystem', symbol: 'SOL', color: 'text-purple-400',
            gradient: 'from-purple-600/20 to-fuchsia-600/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        },
        {
            name: 'BNB Chain', symbol: 'BNB', color: 'text-yellow-400',
            gradient: 'from-yellow-600/20 to-orange-600/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        },
        {
            name: 'Top L1s', symbol: 'L1', color: 'text-emerald-400',
            gradient: 'from-emerald-600/20 to-teal-600/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        },
        {
            name: 'AI Sector', symbol: 'AI', color: 'text-cyan-400',
            gradient: 'from-cyan-600/20 to-blue-600/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        },
        {
            name: 'Meme Sector', symbol: 'Meme', color: 'text-rose-400',
            gradient: 'from-rose-600/20 to-orange-600/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        },
        {
            name: 'Sui Ecosystem', symbol: 'SUI', color: 'text-cyan-400',
            gradient: 'from-cyan-500/20 to-blue-500/5', tokens: [],
            powerScore: 0, momentum: 'Neutral', capitalFlow: 0
        }
    ];

    const mapping: Record<string, number> = {
        'ETH': 0, 'UNI': 0, 'AAVE': 0, 'LINK': 0, 'MKR': 0, 'ENS': 0, 'PEPE': 0, 'SHIB': 0, 'LDO': 0, 'CRV': 0,
        'SUSHI': 0, 'SNX': 0, 'DYDX': 0, 'COMP': 0, 'GRT': 0, 'ARB': 0, 'OP': 0, 'MATIC': 0, 'STRK': 0, 'ZKS': 0,
        'ENA': 0, 'ETHFI': 0, 'PENDLE': 0, 'EIGEN': 0, 'W': 0,
        'SOL': 1, 'JUP': 1, 'RAY': 1, 'PYTH': 1, 'BONK': 1, 'WIF': 1, 'DRIFT': 1, 'HNT': 1, 'JTO': 1, 'BOME': 1,
        'MYRO': 1, 'RENDER': 1, 'NOS': 1, 'IO': 1, 'CLOUD': 1, 'ZEUS': 1, 'METAV': 1, 'WHALES': 1,
        'BNB': 2, 'CAKE': 2, 'BAKE': 2, 'TWT': 2, 'ALPACA': 2, 'SFP': 2, 'WRX': 2, 'DODO': 2, 'XVS': 2, 'BEL': 2,
        'LISTA': 2, 'ID': 2, 'AVAX': 3, 'NEAR': 3, 'FTM': 3, 'DOT': 3, 'ADA': 3, 'TIA': 3, 'SEI': 3, 'APT': 3, 'INJ': 3,
        'GALA': 3, 'IMX': 3, 'BEAM': 3, 'TON': 3, 'KAS': 3, 'ALGO': 3, 'HBAR': 3, 'EGLD': 3, 'MINA': 3,
        'FET': 4, 'AGIX': 4, 'OCEAN': 4, 'RNDR': 4, 'TAO': 4, 'AKT': 4, 'WLD': 4, 'ARKM': 4, 'THETA': 4,
        'PAAL': 4, '0X0': 4, 'AIOZ': 4, 'RSS3': 4,
        'DOGE': 5, 'FLOKI': 5, 'TURBO': 5, 'MEME': 5, 'SLERF': 5, 'MEW': 5, 'DEGEN': 5, 'BRETT': 5, 'MOG': 5, 'COQ': 5, 'TOSHI': 5,
        'SUI': 6, 'CETUS': 6, 'NAVI': 6, 'SCA': 6, 'BLUB': 6, 'DEEP': 6, 'TURBOS': 6, 'SUIA': 6, 'FUD': 6
    };

    tickers.forEach(t => {
        const symbol = t.symbol.toUpperCase();
        const index = mapping[symbol];
        if (index !== undefined) {
            ecosystems[index].tokens.push(t);
        }
    });

    ecosystems.forEach(eco => {
        if (eco.tokens.length === 0) return;
        const avgPerf = eco.tokens.reduce((acc, t) => acc + t.priceChangePercent24h, 0) / eco.tokens.length;
        const sorted = [...eco.tokens].sort((a, b) => b.priceChangePercent24h - a.priceChangePercent24h);
        eco.leader = sorted[0];
        eco.lagger = sorted[sorted.length - 1];

        const tokensAboveVwap = eco.tokens.filter(t => {
            const v = vwapStore[t.id];
            return v && t.priceUsd > v.mid;
        }).length;
        const vwapRatio = tokensAboveVwap / eco.tokens.length;

        const perfScore = Math.min(100, Math.max(0, (avgPerf + 10) * 5));
        const powerScore = Math.floor((perfScore * 0.4) + (vwapRatio * 100 * 0.4) + (Math.min(20, eco.tokens.length) * 1));
        eco.powerScore = Math.min(100, powerScore);

        eco.momentum = avgPerf > 2 ? 'Bullish' : avgPerf < -2 ? 'Bearish' : 'Neutral';
        eco.capitalFlow = eco.tokens.reduce((acc, t) => acc + (t.volume24h * (t.priceChangePercent24h / 100)), 0);
    });

    return ecosystems.filter(e => e.tokens.length > 0);
}
