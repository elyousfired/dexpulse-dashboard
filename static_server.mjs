import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001; // Adjusted to 3001 as previously used

const HUNTS_FILE = path.join(__dirname, 'server', 'data', 'active_hunts.json');
const HISTORY_FILE = path.join(__dirname, 'server', 'data', 'trades_history.json');

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint for the dashboard (JSON)
app.get('/api/hunts', (req, res) => {
    try {
        if (!fs.existsSync(HUNTS_FILE)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8') || '[]');
        res.json(data);
    } catch (e) {
        res.status(500).json([]);
    }
});

// NEW: HTML API Endpoint for the dashboard (Table View with History)
app.get('/api/hunts/html', (req, res) => {
    try {
        let hunts = [];
        let history = [];
        if (fs.existsSync(HUNTS_FILE)) hunts = JSON.parse(fs.readFileSync(HUNTS_FILE, 'utf8') || '[]');
        if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8') || '[]');
        
        // Merge and deduplicate by symbol + entryTime
        const combined = [...hunts, ...history];
        const uniqueMap = new Map();
        combined.forEach(h => {
            const id = `${h.symbol}-${h.entryTime}`;
            if (!uniqueMap.has(id) || h.status === 'closed') uniqueMap.set(id, h);
        });

        const all = Array.from(uniqueMap.values()).sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime)).reverse();
        
        const rows = all.map((h, index) => {
            const pnl = h.status === 'active' 
                ? (h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice * 100) : 0)
                : (h.pnl || 0);
            
            const pnlColor = pnl >= 0 ? '#00ffa3' : '#ff3131';
            const statusColor = h.status === 'active' ? '#3b82f6' : '#9ca3af';

            return `
                <tr style="border-bottom: 1px solid #2d3748;">
                    <td style="padding: 12px;">${index + 1}</td>
                    <td style="padding: 12px; font-weight: bold;">${h.symbol}</td>
                    <td style="padding: 12px;">$${h.entryPrice.toLocaleString()}</td>
                    <td style="padding: 12px; color: ${pnlColor}; font-weight: bold;">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</td>
                    <td style="padding: 12px;"><span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">${h.status.toUpperCase()}</span></td>
                    <td style="padding: 12px; font-size: 0.85em; color: #a0aec0;">${new Date(h.entryTime).toLocaleString()}</td>
                </tr>
            `;
        }).join('');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Dexpulse Hybrid V2 - Full Trade Log</title>
                <meta http-equiv="refresh" content="10">
                <style>
                    body { font-family: 'Inter', -apple-system, sans-serif; background: #0f172a; color: white; margin: 0; padding: 20px; }
                    .card { background: #1e293b; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                    h1 { color: #00ffa3; margin-top: 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { text-align: left; background: #334155; padding: 12px; color: #a0aec0; font-size: 0.9em; }
                    .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                    .stat-item { background: #334155; padding: 10px 20px; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>🛰️ DEXPULSE HYBRID V2 — FULL LOG</h1>
                    <div class="stats">
                        <div class="stat-item">Active Slots: <b>${all.filter(h => h.status === 'active').length}/10</b></div>
                        <div class="stat-item">Total History: <b>${all.length} trades</b></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Symbol</th>
                                <th>Entry Price</th>
                                <th>PnL %</th>
                                <th>Status</th>
                                <th>Entry Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #718096;">No trades found yet.</td></tr>'}
                        </tbody>
                    </table>
                    <p style="color: #718096; font-size: 0.8em; margin-top: 20px;">* Auto-refreshes every 10 seconds. Data sourced from active_hunts + trades_history.</p>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    } catch (e) {
        res.status(500).send('<h1>Error reading hunt data.</h1>');
    }
});

app.get('/', (req, res) => {
    res.redirect('/hybrid_v2_dashboard.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard + API serving on http://0.0.0.0:${PORT}`);
});
