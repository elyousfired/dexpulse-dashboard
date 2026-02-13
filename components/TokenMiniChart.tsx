import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { fetchGeckoOHLCV } from '../services/geckoService';

interface TokenMiniChartProps {
    pairAddress: string;
    chainId: string;
    color?: string;
}

export const TokenMiniChart: React.FC<TokenMiniChartProps> = ({ pairAddress, chainId, color = '#3b82f6' }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: 'transparent',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false },
            },
            width: chartContainerRef.current.clientWidth,
            height: 60,
            handleScroll: false,
            handleScale: false,
            timeScale: {
                visible: false,
            },
            leftPriceScale: {
                visible: false,
            },
            rightPriceScale: {
                visible: false,
            },
            crosshair: {
                vertLine: { visible: false },
                horzLine: { visible: false },
            },
        });

        const areaSeries = chart.addAreaSeries({
            lineColor: color,
            topColor: `${color}44`,
            bottomColor: 'transparent',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });

        chartRef.current = chart;
        areaSeriesRef.current = areaSeries;

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
    }, [color]);

    useEffect(() => {
        const loadData = async () => {
            if (!pairAddress || !chainId) return;
            try {
                // Fetch last 24 hours in 15m intervals (roughly 96 data points)
                const data = await fetchGeckoOHLCV(chainId, pairAddress, 'minute', 15);
                if (areaSeriesRef.current && data.length > 0) {
                    const chartData = data.map(d => ({
                        time: d.time as any,
                        value: d.close,
                    }));
                    areaSeriesRef.current.setData(chartData);
                    chartRef.current?.timeScale().fitContent();
                }
            } catch (error) {
                console.error('Failed to load mini chart data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [pairAddress, chainId]);

    return (
        <div className="mini-chart-container">
            <div ref={chartContainerRef} className="mini-chart-canvas" />
            {loading && <div className="mini-chart-skeleton" />}
        </div>
    );
};
