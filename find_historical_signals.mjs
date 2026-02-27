
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const symbols = ['OM', 'VIRTUAL', 'WLD', 'GUN', 'KSM', 'PENDLE', 'BARD', 'FOGO', 'JST', 'DENT', 'KITE', 'WBETH', 'SKY', 'UNI', 'LUNC', 'ZBT', 'MIRA', 'MORPHO', 'DOT'];

function getMonTs(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(date.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon.getTime();
}

async function fetchWeeklyVwapData(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=15m&limit=1000`;
        const { data: klines15m } = await axios.get(url);
        if (!klines15m.length) return null;

        const klines = klines15m.map(k => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            quoteVolume: parseFloat(k[7])
        }));

        const mondayTs = getMonTs(new Date().toISOString());
        const lastMonTs = getMonTs(new Date(mondayTs - 1).toISOString());

        let wMax = -Infinity, wMin = Infinity;
        let last15mClose = klines[klines.length - 1].close;
        let prev15mClose = klines[klines.length - 2].close;

        klines.forEach(k => {
            if (k.time >= mondayTs) {
                if (k.high > wMax) wMax = k.high;
                if (k.low < wMin) wMin = k.low;
            }
        });

        return { max: wMax, min: wMin, mondayTs, klines };
    } catch (e) { return null; }
}

async function scan() {
    const results = [];
    const startTs = new Date('2026-02-25T00:00:00Z').getTime();

    for (const sym of symbols) {
        const data = await fetchWeeklyVwapData(sym);
        if (!data) continue;

        let weekMaxAtStart = -Infinity;
        data.klines.forEach(k => {
            if (k.time < startTs && k.time >= data.mondayTs) {
                if (k.high > weekMaxAtStart) weekMaxAtStart = k.high;
            }
        });

        if (weekMaxAtStart === -Infinity) {
            // If no data before startTs in current week, use the first candle of the week
            const firstCandle = data.klines.find(k => k.time >= data.mondayTs);
            if (firstCandle) weekMaxAtStart = firstCandle.high;
        }

        for (let i = 1; i < data.klines.length; i++) {
            const k = data.klines[i];
            const pk = data.klines[i - 1];
            if (k.time < startTs) continue;

            const lastClose = k.close;
            const prevClose = pk.close;

            if (lastClose > weekMaxAtStart && prevClose <= weekMaxAtStart) {
                const finalPnl = ((data.max - lastClose) / lastClose) * 100;
                results.push({
                    symbol: sym + 'USDT',
                    entryPrice: lastClose,
                    entryTime: new Date(k.time).toISOString(),
                    peakPrice: data.max,
                    status: 'closed',
                    pnl: finalPnl,
                    capital: 10.0,
                    tier: finalPnl > 30 ? 3 : (finalPnl > 10 ? 2 : 1)
                });
                break;
            }
        }
    }
    console.log(JSON.stringify(results, null, 2));
}

scan();
