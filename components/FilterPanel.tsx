import React from 'react';
import { Filter, X, RotateCcw } from 'lucide-react';
import { FilterState } from '../types';

interface FilterPanelProps {
    filters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    onReset: () => void;
    activeCount: number;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
    filters,
    onFilterChange,
    onReset,
    activeCount
}) => {
    const handleChange = (key: keyof FilterState, value: string | boolean) => {
        onFilterChange({ ...filters, [key]: value });
    };

    const isDefault =
        !filters.liquidityMin && !filters.liquidityMax &&
        !filters.volumeMin && !filters.volumeMax &&
        !filters.maxAgeHours &&
        !filters.solanaOnly &&
        !filters.excludeUnknownAge;

    return (
        <div className="bg-[#11141b] border border-gray-800 rounded-xl p-4 mb-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Advanced Filters</h3>
                    <span className="text-xs text-gray-500 ml-2 border-l border-gray-700 pl-2">
                        Showing {activeCount} tokens
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {!isDefault && (
                        <button
                            onClick={onReset}
                            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Liquidity */}
                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-medium">Liquidity ($)</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Min (e.g. 10k)"
                            className="w-full bg-[#1a1e26] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-gray-600"
                            value={filters.liquidityMin}
                            onChange={(e) => handleChange('liquidityMin', e.target.value)}
                        />
                        <span className="text-gray-600">-</span>
                        <input
                            type="text"
                            placeholder="Max (e.g. 5m)"
                            className="w-full bg-[#1a1e26] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-gray-600"
                            value={filters.liquidityMax}
                            onChange={(e) => handleChange('liquidityMax', e.target.value)}
                        />
                    </div>
                </div>

                {/* Volume */}
                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-medium">Volume 24h ($)</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Min (e.g. 50k)"
                            className="w-full bg-[#1a1e26] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-gray-600"
                            value={filters.volumeMin}
                            onChange={(e) => handleChange('volumeMin', e.target.value)}
                        />
                        <span className="text-gray-600">-</span>
                        <input
                            type="text"
                            placeholder="Max"
                            className="w-full bg-[#1a1e26] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-gray-600"
                            value={filters.volumeMax}
                            onChange={(e) => handleChange('volumeMax', e.target.value)}
                        />
                    </div>
                </div>

                {/* Age */}
                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-medium">Max Age (Hours)</label>
                    <input
                        type="number"
                        placeholder="e.g. 24"
                        className="w-full bg-[#1a1e26] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-gray-600"
                        value={filters.maxAgeHours}
                        onChange={(e) => handleChange('maxAgeHours', e.target.value)}
                    />
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-6">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.solanaOnly ? 'bg-blue-600 border-blue-600' : 'border-gray-600 group-hover:border-gray-500'}`}>
                            {filters.solanaOnly && <span className="text-white text-[10px]">✓</span>}
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={filters.solanaOnly}
                            onChange={(e) => handleChange('solanaOnly', e.target.checked)}
                        />
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Solana Only</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.excludeUnknownAge ? 'bg-blue-600 border-blue-600' : 'border-gray-600 group-hover:border-gray-500'}`}>
                            {filters.excludeUnknownAge && <span className="text-white text-[10px]">✓</span>}
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={filters.excludeUnknownAge}
                            onChange={(e) => handleChange('excludeUnknownAge', e.target.checked)}
                        />
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Exclude Unknown Age</span>
                    </label>
                </div>
            </div>
        </div>
    );
};
