
import React from 'react';
import { BookOpen, Zap, ShieldAlert, TrendingUp, Target, Lightbulb, ArrowUpRight, AlertCircle, Coins } from 'lucide-react';

export const TradingPlaybook: React.FC = () => {
    return (
        <div className="flex flex-col h-full bg-[#0d0f14] rounded-2xl border border-indigo-500/10 shadow-2xl overflow-hidden">
            {/* Playbook Header */}
            <div className="p-8 bg-gradient-to-r from-indigo-900/20 via-[#0d0f14] to-blue-900/20 border-b border-indigo-500/20">
                <div className="flex items-center gap-4">
                    <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                        <BookOpen className="w-10 h-10 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic">Trading Playbook</h2>
                        <p className="text-sm font-bold text-indigo-400/80 uppercase tracking-[0.2em] mt-1">Master the DEXPulse Intelligence Engine</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-16">

                {/* ─── SECTION 1: THE CORE LOGIC ──────────────────────── */}
                <section>
                    <div className="flex items-center gap-3 mb-8">
                        <Lightbulb className="w-6 h-6 text-yellow-400" />
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">The "Why" Behind the Math</h3>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-yellow-400/20 to-transparent"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-6 bg-[#12141c] border border-gray-800 rounded-3xl group hover:border-indigo-500/50 transition-all">
                            <h4 className="flex items-center gap-2 text-indigo-400 font-black uppercase text-xs mb-4">
                                <ShieldAlert size={16} /> Hedge Logic
                            </h4>
                            <p className="text-gray-400 text-sm leading-relaxed mb-4">
                                Our engine detects tokens that exhibit <span className="text-rose-400 font-black">Negative Correlation</span>.
                                When BTC drops, a "Hedge" token either stays flat or pumps.
                            </p>
                            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 font-mono text-[10px] text-gray-500">
                                <span className="text-indigo-500">IF</span> (BTC_Change < 0 && Token_Change > 0) <br />
                                <span className="text-indigo-500">THEN</span> Strength = (Abs_Delta * 10)
                            </div>
                        </div>

                        <div className="p-6 bg-[#12141c] border border-gray-800 rounded-3xl group hover:border-emerald-500/50 transition-all">
                            <h4 className="flex items-center gap-2 text-emerald-400 font-black uppercase text-xs mb-4">
                                <Zap size={16} /> Alpha & Beta Logic
                            </h4>
                            <p className="text-gray-400 text-sm leading-relaxed mb-4">
                                We measure <span className="text-emerald-400 font-black">Beta (Leverage)</span> relative to BTC.
                                Alpha Leaders are tokens that don't just follow BTC, they <span className="italic">amplify</span> its move by a 2x-5x factor.
                            </p>
                            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 font-mono text-[10px] text-gray-500">
                                <span className="text-emerald-500">SCORE</span> = (Token_Change) - (BTC_Change) <br />
                                <span className="text-emerald-500">KING</span> = High Alpha % over 14 Days
                            </div>
                        </div>
                    </div>
                </section>

                {/* ─── SECTION 2: PROFIT STRATEGIES ───────────────────── */}
                <section>
                    <div className="flex items-center gap-3 mb-8">
                        <Target className="w-6 h-6 text-rose-500" />
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">How to Profit (Playbook)</h3>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-rose-500/20 to-transparent"></div>
                    </div>

                    <div className="space-y-6">
                        {/* Strategy 1 */}
                        <div className="relative overflow-hidden p-8 bg-[#12141c] border border-gray-800 rounded-3xl shadow-xl">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <TrendingUp size={80} className="text-emerald-500" />
                            </div>
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="flex-1">
                                    <div className="inline-block px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[10px] font-black uppercase mb-4">
                                        Scenario A: Market is Risk-On (BTC Neutral/Up)
                                    </div>
                                    <h4 className="text-2xl font-black text-white mb-4 italic">The "Alpha King" Ride</h4>
                                    <ul className="space-y-3 text-gray-400 text-sm">
                                        <li className="flex gap-2">
                                            <ArrowUpRight size={18} className="text-emerald-500 shrink-0" />
                                            <span>Scan <strong>Alpha Kings</strong> in Section 2. These have 70%+ mirroring consistency.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <ArrowUpRight size={18} className="text-emerald-500 shrink-0" />
                                            <span><strong>Entry:</strong> Buy when BTC touches 15m VWAP support.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <ArrowUpRight size={18} className="text-emerald-500 shrink-0" />
                                            <span><strong>Profit:</strong> These tokens will typically move 2x-3x faster than BTC. Exit when BTC hits Daily Resistance.</span>
                                        </li>
                                    </ul>
                                </div>
                                <div className="w-full md:w-64 p-6 bg-emerald-950/20 border border-emerald-500/10 rounded-2xl">
                                    <span className="text-[10px] font-black text-emerald-500 uppercase block mb-2">Why you win:</span>
                                    <p className="text-[11px] text-emerald-400 font-bold leading-relaxed">
                                        You are trading with the wind. By picking consistent followers with high beta, you gain massive exposure while keeping the same "Directional Risk" as BTC.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Strategy 2 */}
                        <div className="relative overflow-hidden p-8 bg-[#12141c] border border-gray-800 rounded-3xl shadow-xl">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <ShieldAlert size={80} className="text-blue-500" />
                            </div>
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="flex-1">
                                    <div className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-[10px] font-black uppercase mb-4">
                                        Scenario B: Market is Risk-Off (BTC Crashing)
                                    </div>
                                    <h4 className="text-2xl font-black text-white mb-4 italic">The "Hedge Master" Shield</h4>
                                    <ul className="space-y-3 text-gray-400 text-sm">
                                        <li className="flex gap-2">
                                            <ArrowUpRight size={18} className="text-blue-500 shrink-0" />
                                            <span>Look at <strong>Hedge Masters</strong>. These tokens often have a separate "narrative" (e.g. USDT dominance, specific news).</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <ArrowUpRight size={18} className="text-blue-500 shrink-0" />
                                            <span><strong>Entry:</strong> Rotate 50% of your portfolio into the top Hedge Master if BTC breaks primary 4H support.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <ArrowUpRight size={18} className="text-blue-500 shrink-0" />
                                            <span><strong>Profit:</strong> While the market bleeds, these tokens often attract institutional "Hedged" volume or act as stable sinks.</span>
                                        </li>
                                    </ul>
                                </div>
                                <div className="w-full md:w-64 p-6 bg-blue-950/20 border border-blue-500/10 rounded-2xl">
                                    <span className="text-[10px] font-black text-blue-500 uppercase block mb-2">Why you win:</span>
                                    <p className="text-[11px] text-blue-400 font-bold leading-relaxed">
                                        You survive. By moving capital into tokens that perform well during BTC drops, you protect your capital and potentially gain "Absolute Returns" in a bear move.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ─── SECTION 3: CRITICAL RULES ──────────────────────── */}
                <section className="bg-gradient-to-br from-indigo-900/10 to-transparent p-8 rounded-[40px] border border-indigo-500/10">
                    <div className="flex items-center gap-3 mb-8">
                        <AlertCircle className="w-6 h-6 text-indigo-400" />
                        <h3 className="text-xl font-black text-white uppercase tracking-widest">3 Golden Rules</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-black text-indigo-400 shrink-0">1</div>
                            <div>
                                <h5 className="text-white font-black text-xs uppercase mb-1">Volume is King</h5>
                                <p className="text-gray-500 text-[10px] leading-relaxed">Never trade a signal with low volume. High volume verifies the "Hedge" or "Alpha" is real institutional flow, not a 1-minute wick.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-black text-indigo-400 shrink-0">2</div>
                            <div>
                                <h5 className="text-white font-black text-xs uppercase mb-1">Check Liquidity</h5>
                                <p className="text-gray-500 text-[10px] leading-relaxed">Small caps can show high Alpha but suffer from slippage. For the Playbook to work, target top 100 tickers.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-black text-indigo-400 shrink-0">3</div>
                            <div>
                                <h5 className="text-white font-black text-xs uppercase mb-1">Weekly VWAP Sync</h5>
                                <p className="text-gray-500 text-[10px] leading-relaxed">Combine Playbook signals with VWAP levels. A "Hedge Master" at Weekly Max is a Sell. At Weekly Min, it's a Strong Buy.</p>
                            </div>
                        </div>
                    </div>
                </section>

            </div>

            {/* Playbook Footer */}
            <div className="p-4 border-t border-indigo-500/10 bg-black/40 flex items-center gap-3 transition-all">
                <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-indigo-400" />
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                        Strategy Guide v1.0 • Built for Institutional-Grade Analysis
                    </span>
                </div>
            </div>
        </div>
    );
};
