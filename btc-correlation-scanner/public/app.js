const socket = io();

// DOM Elements
const btcPriceEl = document.getElementById('btc-price');
const btcEmaEl = document.getElementById('btc-ema');
const btcVwapEl = document.getElementById('btc-vwap');

const statTotalEl = document.getElementById('stat-total');
const statSyncedEl = document.getElementById('stat-synced');
const statInverseEl = document.getElementById('stat-inverse');
const statUnalignedEl = document.getElementById('stat-unaligned');
const statPnlEl = document.getElementById('stat-pnl');
const statWinrateEl = document.getElementById('stat-winrate');

const listSynced = document.getElementById('list-synced');
const listInverse = document.getElementById('list-inverse');
const activeGrid = document.getElementById('active-grid');
const historyGrid = document.getElementById('history-grid');

// Control Panel Elements
const inpDist = document.getElementById('inp-distance');
const inpTp = document.getElementById('inp-tp');
const inpSl = document.getElementById('inp-sl');
const inpMax = document.getElementById('inp-max');
const inpLeverage = document.getElementById('inp-leverage');
const inpMaxTime = document.getElementById('inp-max-time');
const btnUpdate = document.getElementById('btn-update-config');

btnUpdate.addEventListener('click', () => {
    const newConfig = {
        entryDistance: parseFloat(inpDist.value),
        takeProfit: parseFloat(inpTp.value),
        stopLoss: parseFloat(inpSl.value),
        maxTrades: parseInt(inpMax.value),
        leverage: parseInt(inpLeverage.value),
        maxHoldSeconds: parseInt(inpMaxTime.value)
    };
    
    btnUpdate.innerText = "Applied!";
    setTimeout(() => btnUpdate.innerText = "Apply Config", 1000);
    
    socket.emit('update-config', newConfig);
});

function createCardHTML(token, isInverse) {
    const vwapDist = (((token.last - token.vwap) / token.vwap) * 100).toFixed(2);
    const colorClass = isInverse ? 'text-short' : 'text-long';
    const distSign = vwapDist > 0 ? '+' : '';

    return `
        <div class="token-card" id="card-${token.symbol}">
            <div class="tc-symbol ${colorClass}">${token.symbol}</div>
            <div class="tc-details">
                <div class="tc-item">
                    <span class="tc-label">Price</span>
                    <span class="tc-value">$${token.last.toFixed(4)}</span>
                </div>
                <div class="tc-item">
                    <span class="tc-label">Dist to VWAP</span>
                    <span class="tc-value ${colorClass}">${distSign}${vwapDist}%</span>
                </div>
                <div class="tc-item">
                    <span class="tc-label">E20 vs E50</span>
                    <span class="tc-value">${token.isEmaUp ? 'UP ▲' : 'DOWN ▼'}</span>
                </div>
            </div>
        </div>
    `;
}

socket.on('correlation-update', (data) => {
    // 1. Update BTC Master Compass
    if (data.btc) {
        btcPriceEl.innerText = `$${data.btc.last.toFixed(2)}`;
        
        const emaStatus = data.btc.isEmaUp ? 'UPTREND 🟢' : 'DOWNTREND 🔴';
        const vwapStatus = data.btc.isAboveVwap ? 'ABOVE 🟢' : 'BELOW 🔴';
        
        btcEmaEl.innerText = `EMA 20/50: ${emaStatus}`;
        btcVwapEl.innerText = `VWAP: ${vwapStatus}`;
    }

    // 2. Update Stats
    if (data.stats) {
        statTotalEl.innerText = data.stats.totalScan;
        statSyncedEl.innerText = data.stats.syncedCount;
        statInverseEl.innerText = data.stats.inverseCount;
        statUnalignedEl.innerText = data.stats.unalignedCount;
    }

    // 3. Render Synced List
    if (data.synced) {
        listSynced.innerHTML = data.synced.map(t => createCardHTML(t, false)).join('');
    }

    // 4. Render Inverse List
    if (data.inverse) {
        listInverse.innerHTML = data.inverse.map(t => createCardHTML(t, true)).join('');
    }

    // 5. Render Active Trades
    if (data.activeTrades) {
        activeGrid.innerHTML = data.activeTrades.map(t => `
            <div class="trade-card ${t.side === 'LONG' ? 'long' : 'short'}">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong>${t.side} ${t.symbol}</strong>
                    <span class="${t.pnl >= 0 ? 'text-long' : 'text-short'}" style="font-weight:bold;">${t.pnl.toFixed(2)}%</span>
                </div>
                <div style="font-size:0.8rem; color:#888;">IN: $${t.entryPrice.toFixed(4)}</div>
            </div>
        `).join('');
    }

    // 6. Render History
    if (data.history) {
        historyGrid.innerHTML = data.history.map(t => {
            const isWin = t.pnl >= 0;
            return `
                <div class="history-card ${isWin ? 'win' : 'loss'}">
                    <div>
                        <strong>${t.symbol}</strong><br>
                        <span style="font-size:0.7rem; color:${t.side === 'LONG'?'var(--synced)':'var(--inverse)'}">${t.side}</span>
                        <br><span style="font-size:0.6rem; color:#888;">${t.status}</span>
                    </div>
                    <div style="font-size:0.8rem; color:#ccc;">
                        IN: $${t.entryPrice.toFixed(4)}<br>
                        OUT: $${t.exitPrice.toFixed(4)}
                    </div>
                    <div class="${isWin ? 'text-long' : 'text-short'}" style="font-weight:bold; font-size:1.2rem; text-align:right;">
                        ${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(2)}%
                    </div>
                </div>
            `;
        }).join('');
    }

    // 7. Update Control Panel from backend
    if (data.config) {
        if (document.activeElement !== inpDist) inpDist.value = data.config.entryDistance;
        if (document.activeElement !== inpTp) inpTp.value = data.config.takeProfit;
        if (document.activeElement !== inpSl) inpSl.value = data.config.stopLoss;
        if (document.activeElement !== inpMax) inpMax.value = data.config.maxTrades;
        if (document.activeElement !== inpLeverage) inpLeverage.value = data.config.leverage;
        if (document.activeElement !== inpMaxTime) inpMaxTime.value = data.config.maxHoldSeconds;
    }

    // 8. Update Engine Stats
    if (data.sessionPnl !== undefined) {
        statPnlEl.innerText = `${data.sessionPnl.toFixed(2)}%`;
        statPnlEl.className = data.sessionPnl >= 0 ? 'text-long' : 'text-short';
        
        const total = data.winCount + data.lossCount;
        const rate = total > 0 ? ((data.winCount / total) * 100).toFixed(1) : 0;
        statWinrateEl.innerHTML = `${rate}% <span style="font-size:0.5em">${data.winCount}W ${data.lossCount}L</span>`;
    }
});

socket.on('connect', () => {
    console.log("Connected to Correlation Engine");
});
