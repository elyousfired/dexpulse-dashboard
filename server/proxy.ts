import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { exec } from 'child_process';
import path from 'path';
import os from 'os';
// @ts-ignore - node:sqlite is experimental
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { runSignalScanner } from './signalScanner';
import { processActiveHunts, registerNewHunt, getDebugLogs } from './strategyTracker';
import { runRotationEngine, lastConfirmedCandidates } from './rotationEngine';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd())));

// Simple memory cache
const cache = new Map();
const CACHE_DURATION = 30 * 1000; // 30 seconds
const CONFIG_FILE = path.join(process.cwd(), 'server', 'bot_config.json');
const HUNTS_FILE = path.join(process.cwd(), 'server', 'data', 'active_hunts.json');
const MARKET_AUDIT_FILE = path.join(process.cwd(), 'server', 'data', 'institutional_market.json');
const LIVE_ORDER_FLOW_FILE = path.join(process.cwd(), 'server', 'data', 'live_order_flow.json');

// ─── Existing: Birdeye OHLCV Proxy ──────────────────────────

app.get('/api/ohlcv', async (req, res) => {
    const { address, interval, time_from, time_to } = req.query;

    if (!process.env.BIRDEYE_API_KEY) {
        return res.status(400).json({ error: 'Missing BIRDEYE_API_KEY' });
    }

    if (!address || !interval || !time_from || !time_to) {
        return res.status(400).json({ error: 'Missing required parameters: address, interval, time_from, time_to' });
    }

    const cacheKey = `ohlcv-${address}-${interval}-${time_from}-${time_to}`;
    const cachedEntry = cache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
        console.log(`[Proxy] Serving cached OHLCV for ${address}`);
        return res.json(cachedEntry.data);
    }

    try {
        console.log(`[Proxy] Fetching OHLCV for ${address} (${interval})`);
        const response = await axios.get('https://public-api.birdeye.so/defi/v3/ohlcv', {
            params: { address, type: interval, time_from, time_to },
            headers: {
                'accept': 'application/json',
                'x-chain': 'solana',
                'X-API-KEY': process.env.BIRDEYE_API_KEY
            }
        });

        const data = response.data;
        cache.set(cacheKey, { timestamp: Date.now(), data });
        pruneCache();
        res.json(data);
    } catch (error: any) {
        console.error('[Proxy] Error fetching from Birdeye:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

// ─── New: GoPlus Security Proxy ──────────────────────────────

app.get('/api/security/:chain/:address', async (req, res) => {
    const { chain, address } = req.params;

    const cacheKey = `security-${chain}-${address}`;
    const cachedEntry = cache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_DURATION * 4) {
        console.log(`[Proxy] Serving cached security for ${address}`);
        return res.json(cachedEntry.data);
    }

    try {
        let url: string;
        if (chain === 'solana') {
            url = `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${address}`;
        } else {
            const chainMap: Record<string, string> = {
                ethereum: '1', bsc: '56', base: '8453', arbitrum: '42161', polygon: '137'
            };
            const chainId = chainMap[chain] || chain;
            url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`;
        }

        console.log(`[Proxy] Fetching security for ${address} on ${chain}`);
        const response = await axios.get(url, {
            headers: { 'accept': 'application/json' },
            timeout: 10000,
        });

        const data = response.data;
        cache.set(cacheKey, { timestamp: Date.now(), data });
        pruneCache();
        res.json(data);
    } catch (error: any) {
        console.error('[Proxy] Security API error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Security API unavailable' });
        }
    }
});

// ─── New: Antfarm AI Proxy ──────────────────────────────────

const ANTFARM_DB_PATH = path.join(os.homedir(), ".openclaw", "antfarm", "antfarm.db");
const ANTFARM_CLI_PATH = path.join(process.cwd(), "temp_antfarm", "dist", "cli", "cli.js");

app.post('/api/antfarm/run', async (req, res) => {
    const { workflow, task } = req.body;
    if (!workflow || !task) {
        return res.status(400).json({ error: 'Missing workflow or task' });
    }

    console.log(`[Proxy] Running Antfarm workflow: ${workflow} for ${task}`);
    // Run via node dist/cli/cli.js
    const command = `node "${ANTFARM_CLI_PATH}" workflow run ${workflow} "${task}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`[Proxy] Antfarm execution error: ${error.message}`);
            return res.status(500).json({ error: 'Antfarm failed to start', details: stderr });
        }

        // Extract run ID from output if possible
        const match = stdout.match(/Run: ([a-f0-9-]+)/i);
        const runId = match ? match[1] : null;

        res.json({ message: 'Workflow started', runId, output: stdout });
    });
});

app.get('/api/antfarm/runs', (req, res) => {
    try {
        const db = new DatabaseSync(ANTFARM_DB_PATH);
        const runs = db.prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 20").all();
        res.json(runs);
    } catch (error: any) {
        console.error('[Proxy] Error reading Antfarm DB:', error.message);
        res.status(500).json({ error: 'Failed to read Antfarm database' });
    }
});

app.get('/api/antfarm/status/:runId', (req, res) => {
    const { runId } = req.params;
    try {
        const db = new DatabaseSync(ANTFARM_DB_PATH);
        const run = db.prepare("SELECT * FROM runs WHERE id = ? OR id LIKE ?").get(runId, `${runId}%`);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all((run as any).id);
        const stories = db.prepare("SELECT * FROM stories WHERE run_id = ? ORDER BY story_index ASC").all((run as any).id);

        res.json({ run, steps, stories });
    } catch (error: any) {
        console.error('[Proxy] Error reading Antfarm run status:', error.message);
        res.status(500).json({ error: 'Failed to read Antfarm database' });
    }
});

// ─── New: Telegram Bot Configuration Sync ──────────────────

app.get('/api/config/telegram', (req, res) => {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            res.json(config);
        } else {
            res.json({ botToken: '', chatId: '', enabled: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to read bot config' });
    }
});

app.post('/api/config/telegram', (req, res) => {
    try {
        const config = req.body;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log('[Proxy] Telegram Bot config updated.');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save bot config' });
    }
});

app.get('/api/hunts', (req, res) => {
    try {
        if (!fs.existsSync(HUNTS_FILE)) {
            return res.json([]);
        }
        const content = fs.readFileSync(HUNTS_FILE, 'utf8').trim();
        if (!content) return res.json([]);

        const hunts = JSON.parse(content);
        res.json(hunts);
    } catch (error) {
        console.error('[Proxy] Error reading hunts file:', (error as Error).message);
        res.json([]); // Return empty list instead of 500 to keep UI "Online"
    }
});

// Shadow Portfolio API
app.get('/api/shadow', (req, res) => {
    try {
        const shadowFile = path.join(process.cwd(), 'density-entree', 'shadow_positions.json');
        if (!fs.existsSync(shadowFile)) {
            return res.json([]);
        }
        const content = fs.readFileSync(shadowFile, 'utf8').trim();
        if (!content) return res.json([]);
        res.json(JSON.parse(content));
    } catch (error) {
        res.json([]);
    }
});

// Institutional Market Audit API
app.get('/api/market/institutional', (req, res) => {
    try {
        if (!fs.existsSync(MARKET_AUDIT_FILE)) {
            return res.json({ timestamp: 0, count: 0, marketAudit: [] });
        }
        const content = fs.readFileSync(MARKET_AUDIT_FILE, 'utf8').trim();
        if (!content) return res.json({ timestamp: 0, count: 0, marketAudit: [] });
        res.json(JSON.parse(content));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read market audit data' });
    }
});

app.get('/api/market/delta', (req, res) => {
    try {
        if (!fs.existsSync(LIVE_ORDER_FLOW_FILE)) {
            return res.json({ timestamp: 0, data: {} });
        }
        const content = fs.readFileSync(LIVE_ORDER_FLOW_FILE, 'utf8').trim();
        if (!content) return res.json({ timestamp: 0, data: {} });
        res.json(JSON.parse(content));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read order flow data' });
    }
});

app.get('/api/vwap-confirmed', (req, res) => {
    try {
        res.json(lastConfirmedCandidates || []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch confirmed candidates' });
    }
});

app.get('/api/debug/logs', (req, res) => {
    try {
        res.json(getDebugLogs());
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch debug logs' });
    }
});

app.post('/api/hunts/register', (req, res) => {
    try {
        const { symbol, price } = req.body;
        if (!symbol || !price) {
            return res.status(400).json({ error: 'Missing symbol or price' });
        }
        console.log(`[Proxy] API Request: Registering ${symbol} at ${price}`);
        registerNewHunt(symbol, price);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to register hunt' });
    }
});

function pruneCache() {
    if (cache.size > 200) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);

    // Start 24/7 background processes
    console.log('[Proxy] Initializing 24/7 background processes...');

    // 1. Signal Scanner (Every 2 minutes for faster live detection)
    setInterval(async () => {
        try { await runSignalScanner(); } catch (e) { console.error('[Proxy] Scanner Error:', e); }
    }, 2 * 60 * 1000);

    // 2. Strategy Tracker (Every 5 seconds)
    setInterval(async () => {
        try {
            console.log('[Heartbeat] Tracker & Rotation Active...');
            await processActiveHunts();
        } catch (e) { console.error('[Proxy] Tracker Error:', e); }
    }, 5 * 1000);

    // 3. Rotation Engine (Every 5 seconds for hyper-fast response)
    setInterval(async () => {
        try { await runRotationEngine(); } catch (e) { console.error('[Proxy] Rotation Error:', e); }
    }, 5 * 1000);

    // Initial runs
    runSignalScanner();
    processActiveHunts();
    runRotationEngine();
});
