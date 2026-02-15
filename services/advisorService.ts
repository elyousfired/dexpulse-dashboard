
import { CexTicker } from '../types';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokens?: number; // Estimated tokens used
}

export interface WarRoomConsensus {
    verdict: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
    agents: {
        researcher: string;
        quant: string;
        risk: string;
    };
    confidence: number;
}

/**
 * Orchestrates the multi-agent reasoning for the Advisor.
 * It simulates a discussion between agents before giving a final answer.
 */
export async function getAdvisorResponse(userQuery: string, context: { tickers: CexTicker[] }): Promise<string> {
    // In a real scenario, this would call a backend proxy sending the data to Antfarm/OpenAI
    // For the demo, we simulate the agent debate.

    return new Promise((resolve) => {
        setTimeout(() => {
            resolve("Based on the data, the Researcher sees high social hype, but the Quant warns about a Weekly VWAP resistance. Risk management suggests staying neutral until a breakout above $45.6k.");
        }, 1500);
    });
}

/**
 * Estimates token usage for a given query and response.
 */
export function estimateCost(input: string, output: string): number {
    return (input.length + output.length) / 4; // Very rough estimation
}
