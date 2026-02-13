import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { exec } from 'child_process';
import path from 'path';
import os from 'os';
// @ts-ignore - node:sqlite is experimental
import { DatabaseSync } from 'node:sqlite';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Simple memory cache
const cache = new Map();
const CACHE_DURATION = 30 * 1000; // 30 seconds

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

function pruneCache() {
    if (cache.size > 200) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
    }
}

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});
