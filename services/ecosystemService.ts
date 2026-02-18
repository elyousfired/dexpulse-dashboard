
import { CexTicker } from '../types';

export interface EcosystemGroup {
    name: string;
    symbol: string; // The native token symbol (e.g. ETH, SOL)
    color: string;
    tokens: CexTicker[];
}

const ECOSYSTEM_MAP: Record<string, string[]> = {
    'Ethereum': ['ETH', 'UNI', 'AAVE', 'LINK', 'MKR', 'ENS', 'PEPE', 'SHIB', 'LDO', 'CRV', 'SUSHI', 'SNX', 'DYDX', 'COMP', 'GRT', 'ARB', 'OP', 'MATIC', 'STRK', 'ZKS', 'ENA', 'ETHFI'],
    'Solana': ['SOL', 'JUP', 'RAY', 'PYTH', 'BONK', 'WIF', 'DRIFT', 'HNT', 'JTO', 'BOME', 'MYRO', 'RENDER', 'NOS'],
    'Binance': ['BNB', 'CAKE', 'BAKE', 'TWT', 'ALPACA', 'SFP', 'WRX', 'DODO', 'XVS', 'BEL'],
    'Layer 2 / Other': ['AVAX', 'NEAR', 'FTM', 'DOT', 'ADA', 'TIA', 'SEI', 'SUI', 'APT', 'INJ', 'GALA', 'IMX', 'BEAM'],
    'AI / Data': ['FET', 'AGIX', 'OCEAN', 'RNDR', 'TAO', 'AKT', 'WLD', 'ARKM', 'THETA'],
    'Memes': ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'BOME', 'TURBO', 'MEME', 'SLERF', 'MEW', 'DEGEN']
};

export function getEcosystemsWithTickers(tickers: CexTicker[]): EcosystemGroup[] {
    const ecosystems: EcosystemGroup[] = [
        { name: 'Ethereum Ecosystem', symbol: 'ETH', color: 'text-blue-400', tokens: [] },
        { name: 'Solana Ecosystem', symbol: 'SOL', color: 'text-purple-400', tokens: [] },
        { name: 'BNB Chain', symbol: 'BNB', color: 'text-yellow-400', tokens: [] },
        { name: 'Top L1s', symbol: 'L1', color: 'text-emerald-400', tokens: [] },
        { name: 'AI Sector', symbol: 'AI', color: 'text-cyan-400', tokens: [] },
        { name: 'Meme Sector', symbol: 'Meme', color: 'text-rose-400', tokens: [] },
    ];

    const mapping: Record<string, number> = {
        'ETH': 0, 'UNI': 0, 'AAVE': 0, 'LINK': 0, 'MKR': 0, 'ENS': 0, 'PEPE': 0, 'SHIB': 0, 'LDO': 0, 'CRV': 0, 'SUSHI': 0, 'SNX': 0, 'DYDX': 0, 'COMP': 0, 'GRT': 0, 'ARB': 0, 'OP': 0, 'MATIC': 0, 'STRK': 0, 'ZKS': 0, 'ENA': 0, 'ETHFI': 0,
        'SOL': 1, 'JUP': 1, 'RAY': 1, 'PYTH': 1, 'BONK': 1, 'WIF': 1, 'DRIFT': 1, 'HNT': 1, 'JTO': 1, 'BOME': 1, 'MYRO': 1, 'RENDER': 1, 'NOS': 1,
        'BNB': 2, 'CAKE': 2, 'BAKE': 2, 'TWT': 2, 'ALPACA': 2, 'SFP': 2, 'WRX': 2, 'DODO': 2, 'XVS': 2, 'BEL': 2,
        'AVAX': 3, 'NEAR': 3, 'FTM': 3, 'DOT': 3, 'ADA': 3, 'TIA': 3, 'SEI': 3, 'SUI': 3, 'APT': 3, 'INJ': 3, 'GALA': 3, 'IMX': 3, 'BEAM': 3,
        'FET': 4, 'AGIX': 4, 'OCEAN': 4, 'RNDR': 4, 'TAO': 4, 'AKT': 4, 'WLD': 4, 'ARKM': 4, 'THETA': 4,
        'DOGE': 5, 'FLOKI': 5, 'TURBO': 5, 'MEME': 5, 'SLERF': 5, 'MEW': 5, 'DEGEN': 5
    };

    tickers.forEach(t => {
        const index = mapping[t.symbol.toUpperCase()];
        if (index !== undefined) {
            ecosystems[index].tokens.push(t);
        }
    });

    // Remove empty ecosystems
    return ecosystems.filter(e => e.tokens.length > 0);
}
