
import React, { useState, useEffect } from 'react';
import { Play, Save, RotateCcw, Code, BarChart2 } from 'lucide-react';

interface ScriptEditorProps {
    initialScript: string;
    onApply: (script: string) => void;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ initialScript, onApply }) => {
    const [script, setScript] = useState(initialScript);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('custom_indicator_script');
        if (saved) {
            setScript(saved);
            setLastSaved(saved);
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('custom_indicator_script', script);
        setLastSaved(script);
        onApply(script);
    };

    const handleReset = () => {
        if (confirm("Reset script to template?")) {
            setScript(initialScript);
        }
    };

    return (
        <div className="script-editor-container flex flex-col h-full bg-[#0d0f14] border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 bg-[#1a1e26] border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Indicator Lab</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="p-1.5 hover:bg-gray-800 rounded text-gray-400 transition-colors"
                        title="Reset to Template"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-all shadow-lg active:scale-95"
                    >
                        <Play className="w-3 h-3 fill-current" />
                        RUN SCRIPT
                    </button>
                </div>
            </div>

            <div className="relative flex-1 group">
                {/* Simulated Line Numbers */}
                <div className="absolute left-0 top-0 bottom-0 w-10 bg-[#11141b] border-r border-gray-800 flex flex-col items-center pt-4 text-[10px] text-gray-600 font-mono select-none">
                    {Array.from({ length: 30 }).map((_, i) => (
                        <div key={i} className="h-[20px] leading-[20px]">{i + 1}</div>
                    ))}
                </div>

                <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    spellCheck={false}
                    className="w-full h-full pl-12 pr-4 py-4 bg-transparent text-gray-300 font-mono text-sm resize-none focus:outline-none scrollbar-thin scrollbar-thumb-gray-700"
                    placeholder="// Write your technical indicator logic here..."
                />
            </div>

            <div className="px-4 py-2 bg-[#11141b] border-t border-gray-800 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3 text-gray-500">
                    <span className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> JS Engine: Active
                    </span>
                    <span>Lines: {script.split('\n').length}</span>
                </div>
                <span className="text-gray-600 italic">
                    {lastSaved ? `Last auto-saved to local disk` : 'Draft unsaved'}
                </span>
            </div>
        </div>
    );
};
