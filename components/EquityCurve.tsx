import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { ActiveHunt } from '../types';

interface EquityCurveProps {
  hunts: ActiveHunt[];
}

export const EquityCurve: React.FC<EquityCurveProps> = ({ hunts }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        vertLine: {
          color: '#22d3ee',
          width: 0.5,
          style: 1,
          labelBackgroundColor: '#0f172a',
        },
        horzLine: {
          color: '#22d3ee',
          width: 0.5,
          style: 1,
          labelBackgroundColor: '#0f172a',
        },
      },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#22d3ee',
      topColor: 'rgba(34, 211, 238, 0.3)',
      bottomColor: 'rgba(34, 211, 238, 0.0)',
      lineWidth: 3,
      priceFormat: {
        type: 'percent',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Prepare data
    const closedHunts = hunts
      .filter(h => h.status === 'closed' && h.exitTime)
      .sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime());

    let cumulativePnL = 0;
    const chartData = closedHunts.map(h => {
      cumulativePnL += (h.pnl || 0);
      return {
        time: Math.floor(new Date(h.exitTime!).getTime() / 1000) as any,
        value: cumulativePnL,
      };
    });

    // Ensure we have at least 2 points and unique times (lightweight-charts requirement)
    if (chartData.length > 0) {
      // deduplicate times if multiple trades closed at same second
      const uniqueData = [];
      const seenTimes = new Set();
      for (const d of chartData) {
        if (!seenTimes.has(d.time)) {
          uniqueData.push(d);
          seenTimes.add(d.time);
        } else {
          // If same time, just update the value to the latest cumulative
          uniqueData[uniqueData.length - 1].value = d.value;
        }
      }
      areaSeries.setData(uniqueData);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [hunts]);

  return (
    <div className="w-full bg-[#0d0f1a] rounded-3xl border border-white/5 p-6 overflow-hidden relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest italic flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Equity Curve
          </h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Cumulative P&L Realized Flow</p>
        </div>
        <div className="flex gap-4">
            <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Growth Peak</span>
                <span className="text-xs font-black text-cyan-400">Stable Expansion</span>
            </div>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
      <div className="absolute bottom-2 right-6 pointer-events-none opacity-20">
         <span className="text-[8px] font-black italic text-cyan-500 uppercase tracking-widest">Dexpulse Structural Ledger v1.0</span>
      </div>
    </div>
  );
};
