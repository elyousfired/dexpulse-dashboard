const socket = io('http://localhost:3007');
const grid = document.getElementById('scanner-grid');
const huntsGrid = document.getElementById('hunts-grid');
const historyList = document.getElementById('history-list');
const tbody = document.getElementById('scanner-body');
const statusText = document.getElementById('status-text');
const lastUpdateEl = document.getElementById('last-update');

// --- State ---
let previousData = {};

socket.on('connect', () => {
    statusText.innerText = 'Connected: Arbitrage Engine Ready';
    statusText.style.color = '#00ff88';
});

socket.on('disconnect', () => {
    statusText.innerText = 'Reconnecting...';
    statusText.style.color = '#ff3e3e';
});

socket.on('ema-update', (data) => {
    const { tokens, hunts, history } = data;
    updateGrid(tokens.slice(0, 4)); 
    updateHunts(hunts);
    updateHistory(history);
    updateTable(tokens);
    lastUpdateEl.innerText = `Last Tick: ${new Date().toLocaleTimeString()}`;
});

function updateHistory(history) {
    if (!history || history.length === 0) {
        historyList.innerHTML = '<div class="no-hunts">No closed trades yet.</div>';
        return;
    }

    historyList.innerHTML = history.map(h => {
        const pnlClass = h.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        return `
            <div class="history-item ${h.pnl < 0 ? 'loss' : ''}">
                <div class="hist-pair">${h.pair[0]} / ${h.pair[1]}</div>
                <div class="hist-pnl ${pnlClass}">${h.pnl > 0 ? '+' : ''}${h.pnl.toFixed(2)}% PnL</div>
            </div>
        `;
    }).join('');
}

function updateHunts(hunts) {
    if (!hunts || hunts.length === 0) {
        huntsGrid.innerHTML = '<div class="no-hunts">Scanning for High Gap Arbitrage...</div>';
        return;
    }

    huntsGrid.innerHTML = hunts.map(h => {
        const pnlClass = h.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        return `
            <div class="hunt-card">
                <div class="hunt-header">
                    <span class="hunt-pair">${h.pair[0]} (S) / ${h.pair[1]} (L)</span>
                    <span class="hunt-pnl ${pnlClass}">${h.pnl > 0 ? '+' : ''}${h.pnl.toFixed(2)}%</span>
                </div>
                <div class="hunt-details">
                    <span>Entry Gap: ${h.entryGap.toFixed(2)}%</span>
                    <span>Current: ${h.currentGap.toFixed(2)}%</span>
                </div>
                <div class="hunt-time">
                    Duration: ${Math.floor((Date.now() - h.startTime) / 1000)}s
                </div>
            </div>
        `;
    }).join('');
}

function updateGrid(top4) {
    grid.innerHTML = top4.map(t => {
        const distColor = t.dist > 0 ? 'bullish' : 'bearish';
        const isEntry = t.signal === 'entry';
        
        return `
            <div class="token-card">
                <div class="token-header">
                    <div class="symbol">${t.symbol}</div>
                    <div class="price">$${formatPrice(t.last)}</div>
                </div>
                <div class="token-stats">
                    <div class="dist-badge ${isEntry ? 'entry' : (t.dist > 0 ? 'positive' : 'negative')}">
                        ${t.dist.toFixed(2)}% Distance
                    </div>
                </div>
                <div class="card-signals">
                    <span class="signal-pill">${t.signal}</span>
                    ${t.overextended ? '<span class="signal-pill overextended">OVEREXTENDED</span>' : ''}
                    ${t.proSignal ? `<span class="signal-pill pro">${t.proSignal}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function updateTable(data) {
    // We'll calculate gaps relative to BTC if present, or just use the first symbol as anchor
    const anchor = data.find(d => d.symbol === 'BTCUSDT') || data[0];
    const anchorDist = anchor ? anchor.dist : 0;

    tbody.innerHTML = data.map(t => {
        const gap = t.dist - anchorDist;
        const sigClass = t.signal.replace(' ', '-');
        
        return `
            <tr>
                <td>
                    <div class="token-name">
                        <span class="symbol">${t.symbol}</span>
                    </div>
                </td>
                <td class="price">$${formatPrice(t.last)}</td>
                <td class="vwap">$${formatPrice(t.vwap)}</td>
                <td class="col-dist ${t.dist > 0 ? 'positive' : 'negative'}">${t.dist.toFixed(2)}%</td>
                <td>
                    <span class="signal-pill ${sigClass}">${t.signal}</span>
                </td>
                <td class="col-dist ${gap > 0 ? 'positive' : 'negative'}">
                    ${gap > 0 ? '+' : ''}${gap.toFixed(2)}%
                </td>
            </tr>
        `;
    }).join('');
}

function formatPrice(p) {
    if (p > 100) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p > 1) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return p.toFixed(6);
}
