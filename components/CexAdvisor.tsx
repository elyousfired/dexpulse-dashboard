
import React, { useState, useRef, useEffect } from 'react';
import { CexTicker } from '../types';
import { Message, getAdvisorResponse, estimateCost } from '../services/advisorService';
import {
    Bot, Send, User, Brain, ShieldAlert, TrendingUp, Search,
    Zap, AlertCircle, Coins, MessageSquare, Loader2, Info
} from 'lucide-react';

interface CexAdvisorProps {
    tickers: CexTicker[];
}

export const CexAdvisor: React.FC<CexAdvisorProps> = ({ tickers }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: "Sbah l-khir! 👋 I'm the Antfarm Advisor. You can ask me about any ticker, market sentiment, or a specific trading strategy. How can I help you today?",
            timestamp: Date.now()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [apiEnabled, setApiEnabled] = useState(true); // Graceful degradation flag
    const [totalTokens, setTotalTokens] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading || !apiEnabled) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Simulate API call - if it fails (e.g. no tokens), we would setApiEnabled(false)
            const response = await getAdvisorResponse(input, { tickers });

            const assistMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
                tokens: estimateCost(input, response)
            };

            setMessages(prev => [...prev, assistMsg]);
            setTotalTokens(prev => prev + (assistMsg.tokens || 0));

        } catch (error) {
            console.error("AI Error:", error);
            // Example of graceful degradation:
            setApiEnabled(false);
            setMessages(prev => [...prev, {
                id: 'err',
                role: 'system',
                content: "⚠️ SYSTEM NOTICE: The AI Advisor is currently offline (Out of Tokens/API Error). However, the rest of the Dashboard is still fully functional!",
                timestamp: Date.now()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-[#0d0f14] rounded-2xl border border-blue-500/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-blue-900/20 via-[#0d0f14] to-indigo-900/20 border-b border-blue-500/20 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                        <Bot className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">AI Trading Advisor</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${apiEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                {apiEnabled ? 'War Room Online' : 'Tokens Exhausted / Offline'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-1 justify-end">
                            <Coins size={10} className="text-yellow-500" /> Token Usage
                        </div>
                        <div className="text-lg font-black text-white">~{Math.round(totalTokens)} <span className="text-[10px] text-gray-600">UNIT</span></div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${m.role === 'user' ? 'bg-indigo-500/10 border-indigo-500/30' :
                                        m.role === 'system' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-blue-500/10 border-blue-500/30'
                                    }`}>
                                    {m.role === 'user' ? <User size={14} className="text-indigo-400" /> : <Bot size={14} className="text-blue-400" />}
                                </div>
                                <div className={`p-4 rounded-3xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' :
                                        m.role === 'system' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' : 'bg-[#12141c] text-gray-300 border border-gray-800 rounded-tl-none'
                                    } shadow-xl`}>
                                    {m.content}
                                    {m.tokens && (
                                        <div className="text-[9px] text-gray-600 font-bold mt-2 uppercase tracking-widest text-right">
                                            Cost: {Math.round(m.tokens)} tokens
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                                    <Loader2 size={14} className="text-blue-400 animate-spin" />
                                </div>
                                <div className="p-4 bg-[#12141c] border border-gray-800 rounded-3xl rounded-tl-none italic text-gray-500 text-xs">
                                    Consulting the War Room (Researcher, Quant, Risk)...
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Sidebar: War Room Consensus */}
                <div className="w-80 border-l border-blue-500/10 bg-black/40 p-6 hidden xl:block">
                    <div className="flex items-center gap-2 mb-8">
                        <Zap size={16} className="text-yellow-500" />
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">War Room Status</h3>
                    </div>

                    <div className="space-y-6">
                        <div className="p-4 bg-[#12141c] border border-gray-800 rounded-2xl">
                            <div className="flex items-center gap-2 mb-2">
                                <Search size={14} className="text-blue-400" />
                                <span className="text-[10px] font-black text-gray-500 uppercase">Researcher</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-emerald-500 w-[80%]"></div>
                            </div>
                            <p className="text-[10px] text-gray-600 font-bold leading-tight">Social pulse is bullish. Hype is organic (High Trust).</p>
                        </div>

                        <div className="p-4 bg-[#12141c] border border-gray-800 rounded-2xl">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={14} className="text-indigo-400" />
                                <span className="text-[10px] font-black text-gray-500 uppercase">Quant Agent</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-yellow-500 w-[45%]"></div>
                            </div>
                            <p className="text-[10px] text-gray-600 font-bold leading-tight">Price testing resistance. Volatility is rising.</p>
                        </div>

                        <div className="p-4 bg-[#12141c] border border-gray-800 rounded-2xl">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldAlert size={14} className="text-rose-400" />
                                <span className="text-[10px] font-black text-gray-500 uppercase">Risk Master</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden mb-2">
                                <div className="h-full bg-rose-500 w-[20%]"></div>
                            </div>
                            <p className="text-[10px] text-gray-600 font-bold leading-tight">Leverage is too high. Advise caution.</p>
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                        <div className="flex items-center gap-2 mb-2 text-blue-400">
                            <Brain size={14} />
                            <span className="text-[10px] font-black uppercase">Consensus</span>
                        </div>
                        <p className="text-xs font-bold text-white uppercase italic">Wait for Breakout</p>
                    </div>
                </div>
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-blue-500/10 bg-black/60">
                <div className="max-w-[1200px] mx-auto flex gap-4">
                    <input
                        type="text"
                        placeholder={apiEnabled ? "Ask anything (e.g. 'Is ETH a buy right now?')..." : "AI Advisor is offline. Tokens exhausted."}
                        disabled={isLoading || !apiEnabled}
                        className={`flex-1 bg-[#12141c] border border-gray-800 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all ${!apiEnabled ? 'opacity-50' : ''}`}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim() || !apiEnabled}
                        className={`p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                    </button>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 opacity-30">
                    <Info size={10} className="text-gray-500" />
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                        This AI can make mistakes. Always verify with Technical Analysis.
                    </span>
                </div>
            </div>
        </div>
    );
};
