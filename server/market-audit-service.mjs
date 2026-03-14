#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🏦  INSTITUTIONAL MARKET AUDIT SERVICE (Scanner 3.0)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Main Objectives:
 *    ✅ Global Scan: Audit top 300 symbols by volume.
 *    ✅ Gainer Audit: Identify "Liquidity Traps" in Top Gainers.
 *    ✅ Institutional Score: Derived from Volume/Depth/Spread.
 *    ✅ Data Output: Saves to server/data/institutional_market.json
 *
 *  Run:   node server/market-audit-service.mjs
 *  PM2:   pm2 start server/market-audit-service.mjs --name market-audit
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data', 'institutional_market.json');

const CONFIG = {
    scanIntervalMs: 60 * 1000, // Full global audit every 60s
    depthLimit: 100,
    topTotal: 300,
    surveillanceCap: 40, // Deep depth audit for top X movers to avoid rate limits
};

async function fetchTickers() {
    try {
        const res = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        return res.data.filter(t => t.symbol.endsWith('USDT'));
    } catch (e) {
        console.error(`[Global] ❌ Ticker fetch failed: ${e.message}`);
        return [];
    }
}

async function fetchDepth(symbol) {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${CONFIG.depthLimit}`);
        return res.data;
    } catch (e) {
        return null;
    }
}

function calculateInstitutionalMetric(ticker, depth) {
    if (!depth || !depth.bids || !depth.bids.length || !depth.asks || !depth.asks.length) {
        return { score: 0, isTrap: true, spread: 1, ratio: 0, depth1: 0, clusters: [] };
    }

    const bids = depth.bids.map(b => ({ p: parseFloat(b[0]), q: parseFloat(b[1]) }));
    const asks = depth.asks.map(a => ({ p: parseFloat(a[0]), q: parseFloat(a[1]) }));

    const bestBid = bids[0].p;
    const bestAsk = asks[0].p;
    const mid = (bestBid + bestAsk) / 2;
    const spreadPct = ((bestAsk - bestBid) / mid) * 100;

    // Depth in 1%
    const bidDepth1 = bids.filter(b => b.p >= mid * 0.99).reduce((s, x) => s + (x.p * x.q), 0);
    const askDepth1 = asks.filter(a => a.p <= mid * 1.01).reduce((s, x) => s + (x.p * x.q), 0);
    const totalDepth1 = bidDepth1 + askDepth1;

    // Detect Clusters (Walls > 3x average depth in its side)
    const avgBidQ = bids.reduce((s, x) => s + x.q, 0) / bids.length;
    const avgAskQ = asks.reduce((s, x) => s + x.q, 0) / asks.length;
    
    const clusters = [];
    bids.slice(0, 50).forEach(b => {
        if (b.q > avgBidQ * 4) clusters.push({ side: 'BUY', price: b.p, qty: b.q, strength: (b.q / avgBidQ).toFixed(1) });
    });
    asks.slice(0, 50).forEach(a => {
        if (a.q > avgAskQ * 4) clusters.push({ side: 'SELL', price: a.p, qty: a.q, strength: (a.q / avgAskQ).toFixed(1) });
    });

    const pressureRatio = askDepth1 > 0 ? bidDepth1 / askDepth1 : 1;
    const vol24h = parseFloat(ticker.quoteVolume);

    // Scoring Logic (0 - 100)
    let score = 0;
    if (vol24h > 10_000_000) score += 40;
    else if (vol24h > 2_000_000) score += 20;

    if (spreadPct < 0.05) score += 30;
    else if (spreadPct < 0.1) score += 15;

    if (pressureRatio > 1.2) score += 30;
    else if (pressureRatio > 0.8) score += 15;

    // Trap Detection: High Gains + Wide Spread + Low Depth
    const priceChangePct = parseFloat(ticker.priceChangePercent);
    const isTrap = (priceChangePct > 5 && (spreadPct > 0.1 || totalDepth1 < 20000));

    return {
        score,
        isTrap,
        spread: spreadPct,
        ratio: pressureRatio,
        depth1: totalDepth1,
        bidDepth1,
        askDepth1,
        clusters: clusters.slice(0, 5) // Top 5 strongest clusters
    };
}

async function startGlobalAudit() {
    console.log(`[Scanner 3.0] 🛡️ Starting Institutional Global Audit at ${new Date().toISOString()}`);

    try {
        const tickers = await fetchTickers();
        if (!tickers.length) return;

        // 1. Filter Top 300 by Volume
        const top300 = tickers
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, CONFIG.topTotal);

        // 2. Identify Gainers for Surveillance
        const topGainers = [...top300]
            .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
            .slice(0, CONFIG.surveillanceCap);

        // 3. Deep Audit surveillance pool (Gainers + High Volume)
        const surveillanceList = [...new Set([...topGainers, ...top300.slice(0, 10)])];
        console.log(`[Scanner] 🕵️ Deep auditing ${surveillanceList.length} high-priority symbols...`);

        const auditedResults = [];

        for (const t of top300) {
            let metrics = { score: 0, isTrap: false, spread: 0, ratio: 1, depth1: 0 };
            
            // Only fetch depth for surveillance list to stay safe with rate limits
            if (surveillanceList.some(s => s.symbol === t.symbol)) {
                const depth = await fetchDepth(t.symbol);
                metrics = calculateInstitutionalMetric(t, depth);
                // Delay to be extra safe
                await new Promise(r => setTimeout(r, 100));
            }

            auditedResults.push({
                symbol: t.symbol,
                price: t.lastPrice,
                change: t.priceChangePercent,
                volume: t.quoteVolume,
                ...metrics,
                lastUpdate: Date.now()
            });
        }

        const scanData = {
            timestamp: Date.now(),
            count: auditedResults.length,
            marketAudit: auditedResults
        };

        fs.writeFileSync(DATA_FILE, JSON.stringify(scanData, null, 2));
        console.log(`[Scanner] ✅ Global Audit Complete. Saved ${auditedResults.length} symbols to ${DATA_FILE}`);

    } catch (e) {
        console.error(`[Scanner] ❌ Critical failure during audit: ${e.message}`);
    }
}

// Ensure data dir exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Loop
startGlobalAudit();
setInterval(startGlobalAudit, CONFIG.scanIntervalMs);
