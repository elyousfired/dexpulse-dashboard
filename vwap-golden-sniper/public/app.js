const socket = io();

const btcPriceEl = document.getElementById('btc-price');
const btcTrendsEl = document.getElementById('btc-trends');

const statPnlEl = document.getElementById('stat-pnl');
const statRadarEl = document.getElementById('stat-radar');
const statTotalEl = document.getElementById('stat-total');

const lblMaxTrades = document.getElementById('lbl-max-trades');
const radarList = document.getElementById('radar-list');
const activeGrid = document.getElementById('active-grid');
const historyGrid = document.getElementById('history-grid');

const inpDist = document.getElementById('inp-distance');
const inpMaxPump = document.getElementById('inp-max-pump');
const inpTp = document.getElementById('inp-tp');
const inpSl = document.getElementById('inp-sl');
const inpMax = document.getElementById('inp-max');
const inpLeverage = document.getElementById('inp-leverage');
const inpMaxTime = document.getElementById('inp-max-time');
const btnUpdate = document.getElementById('btn-update-config');
const ctx = document.getElementById('pnlChart').getContext('2d');
const pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [{
            label: 'Session Engine PNL (%)',
            data: [],
            borderColor: '#EAB308',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'linear', display: false },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#94A3B8' }
            }
        },
        plugins: { legend: { display: false } },
        animation: { duration: 0 }
    }
});

btnUpdate.addEventListener('click', () => {
    const newConfig = {
        entryDistance: parseFloat(inpDist.value),
        maxDailyPump: parseFloat(inpMaxPump.value),
        takeProfit: parseFloat(inpTp.value),
        stopLoss: parseFloat(inpSl.value),
        maxTrades: parseInt(inpMax.value),
        leverage: parseInt(inpLeverage.value),
        maxHoldSeconds: parseInt(inpMaxTime.value)
    };
    
    btnUpdate.innerText = "Config Applied!";
    setTimeout(() => btnUpdate.innerText = "Apply Target Config", 1000);
    
    socket.emit('update-config', newConfig);
});

socket.on('breakout-update', (data) => {
    // 1. BTC Compass
    if (data.btc) {
        btcPriceEl.innerText = `$${data.btc.last.toFixed(2)}`;
        const btcTrendStatus = data.btc.isEmaUp;
        btcTrendsEl.innerText = btcTrendStatus ? 'OVERALL DIRECTION: UP 🟢' : 'OVERALL DIRECTION: DOWN 🔴';
        btcTrendsEl.style.color = btcTrendStatus ? 'var(--synced)' : 'var(--inverse)';
    }

    // 2. Stats
    if (data.stats) {
        statTotalEl.innerText = data.stats.totalScan;
        statRadarEl.innerText = data.stats.approachingVWAP;
    }

    // 3. Radar Watchlist
    if (data.watchlist) {
        radarList.innerHTML = data.watchlist.map(t => {
            const emaVwapDist = (((t.ema20 - t.vwap) / t.vwap) * 100).toFixed(2);
            return `
            <div class="watchlist-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="tc-symbol">${t.symbol}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted);">24h: ${t.dailyChange > 0 ? '+' : ''}${t.dailyChange.toFixed(2)}%</span>
                </div>
                <div class="tc-details">
                    <div class="tc-item">
                        <span class="tc-label">Price / VWAP</span>
                        <span class="tc-value">$${t.last.toFixed(4)} / $${t.vwap.toFixed(4)}</span>
                    </div>
                    <div class="tc-item">
                        <span class="tc-label">EMA Gap to VWAP</span>
                        <span class="tc-value text-accent" style="font-weight:700;">${emaVwapDist}%</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    // 4. Config sync
    if (data.config) {
        lblMaxTrades.innerText = data.config.maxTrades;
        if (document.activeElement !== inpDist) inpDist.value = data.config.entryDistance;
        if (document.activeElement !== inpMaxPump) inpMaxPump.value = data.config.maxDailyPump;
        if (document.activeElement !== inpTp) inpTp.value = data.config.takeProfit;
        if (document.activeElement !== inpSl) inpSl.value = data.config.stopLoss;
        if (document.activeElement !== inpMax) inpMax.value = data.config.maxTrades;
        if (document.activeElement !== inpLeverage) inpLeverage.value = data.config.leverage;
        if (document.activeElement !== inpMaxTime) inpMaxTime.value = data.config.maxHoldSeconds;
    }

    // 5. Active Snipes
    if (data.activeTrades) {
        activeGrid.innerHTML = data.activeTrades.map(t => {
            const timeIn = new Date(t.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            return `
            <div class="trade-card ${t.side === 'LONG' ? 'long' : 'short'}">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong>${t.side} ${t.symbol}</strong>
                    <span class="${t.pnl >= 0 ? 'text-long' : 'text-short'}" style="font-weight:bold;">${t.pnl.toFixed(2)}%</span>
                </div>
                <div style="font-size:0.8rem; color:#888;">
                    <strong>LIVE PRICE: <span style="color:var(--text-main);">$${t.livePrice.toFixed(4)}</span></strong><br>
                    ENTRY: $${t.entryPrice.toFixed(4)}<br>
                    TIME IN: ${timeIn}
                </div>
            </div>
            `;
        }).join('');
    }

    // 6. History
    if (data.history) {
        historyGrid.innerHTML = data.history.map(t => {
            const isWin = t.pnl >= 0;
            const timeIn = new Date(t.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const timeOut = t.endTime ? new Date(t.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
            return `
                <div class="history-card ${isWin ? 'win' : 'loss'}">
                    <div>
                        <strong>${t.symbol}</strong><br>
                        <span style="font-size:0.7rem; color:${t.side === 'LONG'?'var(--synced)':'var(--inverse)'}">${t.side} BREAKOUT</span>
                        <br><span style="font-size:0.6rem; color:#888;">${t.status}</span>
                    </div>
                    <div style="font-size:0.8rem; color:#ccc;">
                        IN: $${t.entryPrice.toFixed(4)}<br>
                        OUT: $${t.exitPrice.toFixed(4)}
                    </div>
                    <div style="font-size:0.75rem; color:#888; text-align:right;">
                        ${timeIn} -> ${timeOut}
                    </div>
                    <div class="${isWin ? 'text-long' : 'text-short'}" style="font-weight:bold; font-size:1.2rem; text-align:right;">
                        ${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(2)}%
                    </div>
                </div>
            `;
        }).join('');
    }

    if (data.sessionPnl !== undefined) {
        statPnlEl.innerText = `${data.sessionPnl.toFixed(2)}%`;
        statPnlEl.className = data.sessionPnl >= 0 ? 'text-long' : 'text-short';
        statPnlEl.style.fontWeight = '800';
    }
    
    // 7. PNL Chart
    if (data.sessionPnlHistory) {
        pnlChart.data.datasets[0].data = data.sessionPnlHistory.map(entry => ({ x: entry.time, y: entry.pnl }));
        pnlChart.update();
    }
});
