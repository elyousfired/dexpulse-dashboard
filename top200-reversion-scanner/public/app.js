const socket = io('http://localhost:3008');

// --- Elements ---
const activeGrid = document.getElementById('active-grid');
const shortGrid = document.getElementById('short-grid');
const longGrid = document.getElementById('long-grid');
const historyGrid = document.getElementById('history-grid');
const statusText = document.getElementById('status-text');
const lastUpdateEl = document.getElementById('last-update');
const sessionPnlEl = document.getElementById('session-pnl');

// Control Panel Elements
const inpDist = document.getElementById('inp-distance');
const inpTp = document.getElementById('inp-tp');
const inpSl = document.getElementById('inp-sl');
const inpMax = document.getElementById('inp-max');
const inpLeverage = document.getElementById('inp-leverage');
const inpMaxTime = document.getElementById('inp-max-time');
const btnUpdate = document.getElementById('btn-update-config');

// Labels to update dynamically
const lblSubtitle = document.getElementById('lbl-subtitle');
const lblActiveTitle = document.getElementById('lbl-active-title');
const lblShortPool = document.getElementById('lbl-short-pool');
const lblLongPool = document.getElementById('lbl-long-pool');

// Analytics Elements
const btcMacroEl = document.getElementById('btc-macro');
const winRateEl = document.getElementById('win-rate');
const winLossesEl = document.getElementById('win-losses');
const bestTokenEl = document.getElementById('best-token');
const worstTokenEl = document.getElementById('worst-token');

// --- Chart Initialization ---
const ctx = document.getElementById('pnl-chart').getContext('2d');
let pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Net PnL %',
            data: [],
            borderColor: '#ff00ff',
            backgroundColor: 'rgba(255, 0, 255, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { display: false },
            y: { 
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#888899' }
            }
        }
    }
});

// --- State ---
socket.on('connect', () => {
    statusText.innerText = 'Connected: Execution Engine Active';
    statusText.style.color = 'var(--long-color)';
});

socket.on('disconnect', () => {
    statusText.innerText = 'Connection Lost. Reconnecting...';
    statusText.style.color = 'var(--short-color)';
});

// User updates config
btnUpdate.addEventListener('click', () => {
    const newConfig = {
        entryDistance: parseFloat(inpDist.value),
        takeProfit: parseFloat(inpTp.value),
        stopLoss: parseFloat(inpSl.value),
        maxTrades: parseInt(inpMax.value),
        leverage: parseInt(inpLeverage.value),
        maxHoldSeconds: parseInt(inpMaxTime.value)
    };
    
    // Optimistic UI updates
    updateLabels(newConfig);

    // Send to backend
    socket.emit('update-config', newConfig);
    
    btnUpdate.innerText = "Applied ✓";
    setTimeout(() => btnUpdate.innerText = "Apply Config", 2000);
});

// Engine Update Event
socket.on('engine-update', (data) => {
    if (!data) return;

    updateActiveTrades(data.activeTrades);
    updateOppsGrid(shortGrid, data.topShorts, 'short');
    updateOppsGrid(longGrid, data.topLongs, 'long');
    updateHistory(data.history);
    
    if (data.sessionPnl !== undefined) {
        sessionPnlEl.innerText = `${data.sessionPnl > 0 ? '+' : ''}${data.sessionPnl.toFixed(2)}%`;
        sessionPnlEl.className = `stat-value ${data.sessionPnl > 0 ? 'text-long' : (data.sessionPnl < 0 ? 'text-short' : 'text-neutral')}`;
    }

    if (data.config) {
        updateLabels(data.config);
        if (document.activeElement !== inpDist) inpDist.value = data.config.entryDistance;
        if (document.activeElement !== inpTp) inpTp.value = data.config.takeProfit;
        if (document.activeElement !== inpSl) inpSl.value = data.config.stopLoss;
        if (document.activeElement !== inpMax) inpMax.value = data.config.maxTrades;
        if (document.activeElement !== inpLeverage) inpLeverage.value = data.config.leverage;
        if (document.activeElement !== inpMaxTime) inpMaxTime.value = data.config.maxHoldSeconds;
    }

    if (data.analytics) {
        const { winCount, lossCount, pnlHistory, bestToken, worstToken, btcMacro } = data.analytics;
        const total = winCount + lossCount;
        const rate = total > 0 ? ((winCount / total) * 100).toFixed(1) : 0;
        
        if (btcMacro) {
            btcMacroEl.innerHTML = `${btcMacro.trend} <br><span style="font-size:0.6rem; color:#888;">E20: ${Math.round(btcMacro.ema20)} | E50: ${Math.round(btcMacro.ema50)}</span>`;
            btcMacroEl.className = `stat-value ${btcMacro.trend === 'UP' ? 'text-long' : 'text-short'}`;
        }

        winRateEl.innerText = `${rate}%`;
        winLossesEl.innerText = `${winCount}W - ${lossCount}L`;

        if (bestToken) bestTokenEl.innerText = `${bestToken.symbol} (${bestToken.netPnl > 0 ? '+':''}${bestToken.netPnl.toFixed(2)}%)`;
        if (worstToken) worstTokenEl.innerText = `${worstToken.symbol} (${worstToken.netPnl > 0 ? '+':''}${worstToken.netPnl.toFixed(2)}%)`;

        // Update Chart
        if (pnlHistory && pnlHistory.length > 0) {
            pnlChart.data.labels = pnlHistory.map(p => p.time);
            pnlChart.data.datasets[0].data = pnlHistory.map(p => p.pnl);
            
            // Dynamic color based on PnL
            const latestPnl = pnlHistory[pnlHistory.length - 1].pnl;
            const cColor = latestPnl >= 0 ? '#00ff88' : '#ff3e3e';
            const cFill = latestPnl >= 0 ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 62, 62, 0.1)';
            
            pnlChart.data.datasets[0].borderColor = cColor;
            pnlChart.data.datasets[0].backgroundColor = cFill;
            pnlChart.update();
        }
    }

    lastUpdateEl.innerText = `Last Tick: ${new Date().toLocaleTimeString()}`;
});

function updateLabels(cfg) {
    lblSubtitle.innerText = `Strict Concurrency Engine: Max ${cfg.maxTrades} Trades | Leverage ${cfg.leverage}x (Bracket Reversal EMA 20)`;
    lblActiveTitle.innerText = `LIVE ACTIVE TRADES (Max ${cfg.maxTrades})`;
    lblShortPool.innerText = `SHORT POOL (Dist > ${cfg.entryDistance}%)`;
    lblLongPool.innerText = `LONG POOL (Dist < -${cfg.entryDistance}%)`;
}

function updateActiveTrades(trades) {
    if (!trades || trades.length === 0) {
        activeGrid.innerHTML = `
            <div class="empty-trades">
                <p>Waiting for an edge...</p>
                <span>Scanning Top 200 for distance > 0.45%</span>
            </div>
        `;
        return;
    }

    activeGrid.innerHTML = trades.map(t => {
        const isShort = t.side === 'SHORT';
        const colorVar = isShort ? 'var(--short-color)' : 'var(--long-color)';
        const pnlColorClass = t.pnl >= 0 ? 'text-long' : 'text-short';
        
        return `
            <div class="active-trade-card" style="border-left: 4px solid ${colorVar}">
                <div class="at-header">
                    <span class="at-symbol">${t.symbol}</span>
                    <span class="at-side" style="color: ${colorVar}">${t.side}</span>
                </div>
                <div class="at-body">
                    <div class="at-stat">
                        <label>Entry Gap</label>
                        <span>${isShort?'+':''}${t.entryGap.toFixed(2)}%</span>
                    </div>
                    <div class="at-stat">
                        <label>Current Gap</label>
                        <span>${isShort?'+':''}${t.currentGap.toFixed(2)}%</span>
                    </div>
                </div>
                <div class="at-footer">
                    <div style="display: flex; flex-direction: column;">
                        <div class="at-pnl ${pnlColorClass}">${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(2)}% PnL</div>
                        <div style="font-size: 0.65rem; color: #ffaa00; font-weight: 700; margin-top: 2px;">LIQ: $${formatPrice(t.liqPrice)}</div>
                    </div>
                    <div class="at-duration">${Math.floor((Date.now() - t.startTime) / 1000)}s Open</div>
                </div>
            </div>
        `;
    }).join('');
}

function updateOppsGrid(gridElement, items, type) {
    if (!items || items.length === 0) {
        gridElement.innerHTML = `<div class="empty-pool">Pool empty. No >0.45% distance tokens.</div>`;
        return;
    }

    gridElement.innerHTML = items.map(t => {
        const pColor = type === 'short' ? 'text-short' : 'text-long';
        return `
            <div class="pool-card">
                <div>
                    <div class="symbol">${t.symbol}</div>
                    <div class="price">$${formatPrice(t.last)}</div>
                </div>
                <div class="pool-dist ${pColor}">${t.dist > 0 ? '+' : ''}${t.dist.toFixed(2)}%</div>
            </div>
        `;
    }).join('');
}

function updateHistory(history) {
    if (!history || history.length === 0) {
        historyGrid.innerHTML = '<div class="empty-pool">No closed trades yet.</div>';
        return;
    }

    historyGrid.innerHTML = history.map(t => {
        const isWin = t.pnl > 0;
        const pClass = isWin ? 'text-long' : 'text-short';
        const sideColor = t.side === 'SHORT' ? 'var(--short-color)' : 'var(--long-color)';
        
        const dStart = new Date(t.startTime).toLocaleTimeString();
        const dEnd = new Date(t.endTime).toLocaleTimeString();
        const dur = Math.floor((t.endTime - t.startTime) / 1000);

        return `
            <div class="history-item" style="border-left-color: ${sideColor}">
                <div class="hi-header">
                    <span style="font-weight: 800; font-size: 1.1rem">${t.symbol}</span>
                    <span style="color: ${sideColor}; font-size: 0.7em; font-weight:800">${t.side}</span>
                    <span style="font-size: 0.7em; color: var(--text-dim); margin-top: 4px;">${t.status}</span>
                </div>
                
                <div class="hi-detail">
                    <label>Duration</label>
                    <span>${dStart} ➔ ${dEnd} (${dur}s)</span>
                </div>

                <div class="hi-detail">
                    <label>Filled Price & Gap</label>
                    <span style="color: var(--text-dim)">IN: $${formatPrice(t.entryPrice)} (${t.entryGap > 0 ? '+':''}${t.entryGap.toFixed(2)}%)</span>
                    <span>OUT: $${formatPrice(t.exitPrice)} (${t.exitGap > 0 ? '+':''}${t.exitGap.toFixed(2)}%)</span>
                </div>

                <div style="text-align: right;">
                    <div class="hi-pnl ${pClass}">${isWin ? '+' : ''}${t.pnl.toFixed(2)}%</div>
                </div>
            </div>
        `;
    }).join('');
}

function formatPrice(p) {
    if (p > 100) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p > 1) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return p.toFixed(6);
}
