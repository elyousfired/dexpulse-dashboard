
        const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://187.124.33.159:3001' : `http://${window.location.hostname}:3001`;

        let shadowData = [];
        let rotationData = [];
        let tslData = [];
        let shadowSort = 'peakPnl';
        let rotationSort = 'time';
        let tslSort = 'time';

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
            document.getElementById('shadowTab').classList.toggle('hidden', tab !== 'shadow');
            document.getElementById('rotationTab').classList.toggle('hidden', tab !== 'rotation');
            document.getElementById('tslTab').classList.toggle('hidden', tab !== 'tsl');
        }

        function setShadowSort(s) {
            shadowSort = s;
            document.querySelectorAll('#shadowSort .sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
            renderShadow();
        }
        function setRotationSort(s) {
            rotationSort = s;
            document.querySelectorAll('#rotationSort .sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
            renderRotation();
        }
        function setTslSort(s) {
            tslSort = s;
            document.querySelectorAll('#tslSort .sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
            renderTsl();
        }

        async function loadAll() {
            try {
                const [shadowRes, huntsRes] = await Promise.all([
                    fetch(`${BASE}/api/shadow`),
                    fetch(`${BASE}/api/hunts`)
                ]);
                shadowData = await shadowRes.json();
                const hunts = await huntsRes.json();
                rotationData = hunts.filter(h => h.strategyId === 'golden_rotation');
                tslData = hunts.filter(h => h.strategyId === 'vwap_tsl');
                renderShadow();
                renderRotation();
                renderTsl();
                document.getElementById('lastUpdate').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
            } catch (e) {
                document.getElementById('shadowGrid').innerHTML = `<div class="loader">❌ ${e.message}</div>`;
            }
        }

        // ═══ SHADOW RENDER ═══
        function renderShadow() {
            if (shadowData.length === 0) {
                document.getElementById('shadowStats').innerHTML = '<div class="loader">No shadow positions yet — waiting for tracker...</div>';
                document.getElementById('shadowGrid').innerHTML = '<div class="loader">👻 Shadow tracker not started yet. Run: pm2 start density-entree/shadow-tracker.mjs --name shadow-tracker</div>';
                return;
            }

            const totalCurrent = shadowData.reduce((s, p) => s + (p.currentPnl || 0), 0);
            const totalPeak = shadowData.reduce((s, p) => s + (p.peakPnl || 0), 0);
            const avgPeak = totalPeak / shadowData.length;
            const positive = shadowData.filter(p => (p.currentPnl || 0) > 0).length;
            const bestPeak = shadowData.reduce((b, p) => (p.peakPnl || 0) > (b.peakPnl || 0) ? p : b, shadowData[0]);

            document.getElementById('shadowStats').innerHTML = `
                <div class="stat">
                    <div class="label">Positions</div>
                    <div class="value" style="color:#a78bfa">${shadowData.length}</div>
                </div>
                <div class="stat">
                    <div class="label">Current Sum PnL</div>
                    <div class="value" style="color:${totalCurrent >= 0 ? '#22c55e' : '#ef4444'}">${totalCurrent >= 0 ? '+' : ''}${totalCurrent.toFixed(2)}%</div>
                </div>
                <div class="stat">
                    <div class="label">Peak Sum PnL</div>
                    <div class="value" style="color:#f59e0b">+${totalPeak.toFixed(2)}%</div>
                </div>
                <div class="stat">
                    <div class="label">Avg Peak</div>
                    <div class="value" style="color:#f59e0b">+${avgPeak.toFixed(2)}%</div>
                </div>
                <div class="stat">
                    <div class="label">Best Peak</div>
                    <div class="value" style="color:#22c55e">${bestPeak.symbol?.replace('USDT', '')} +${(bestPeak.peakPnl || 0).toFixed(1)}%</div>
                </div>
                <div class="stat">
                    <div class="label">Now Positive</div>
                    <div class="value" style="color:#22c55e">${positive}/${shadowData.length}</div>
                </div>
            `;

            let sorted = [...shadowData];
            switch (shadowSort) {
                case 'peakPnl': sorted.sort((a, b) => (b.peakPnl || 0) - (a.peakPnl || 0)); break;
                case 'currentPnl': sorted.sort((a, b) => (b.currentPnl || 0) - (a.currentPnl || 0)); break;
                case 'time': sorted.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime)); break;
                case 'density': sorted.sort((a, b) => (b.density || 0) - (a.density || 0)); break;
            }

            document.getElementById('shadowGrid').innerHTML = sorted.map(p => {
                const cur = p.currentPnl || 0;
                const peak = p.peakPnl || 0;
                const cls = cur >= 0 ? 'positive' : 'negative';
                const pnlCls = cur >= 0 ? 'green' : 'red';
                const d = p.density || 0;
                let dCls = 'low';
                if (d >= 60) dCls = 'high';
                else if (d >= 30) dCls = 'medium';
                const barW = Math.min(Math.abs(peak) / 10 * 100, 100);
                const dur = Math.round((Date.now() - new Date(p.entryTime)) / 60000);
                const durStr = dur >= 1440 ? `${Math.floor(dur/1440)}d${Math.floor((dur%1440)/60)}h` :
                    dur >= 60 ? `${Math.floor(dur/60)}h${dur%60}m` : `${dur}m`;

                return `
                    <div class="token-card ${cls}">
                        <div class="token-top">
                            <div>
                                <span class="token-symbol">${p.symbol.replace('USDT', '')}</span>
                                <span class="density-badge ${dCls}">D: ${d}%</span>
                            </div>
                            <span class="token-pnl ${pnlCls}">${cur >= 0 ? '+' : ''}${cur.toFixed(2)}%</span>
                        </div>
                        <div class="peak-badge">🏔️ Peak: +${peak.toFixed(2)}% ($${p.peakPrice || '—'})</div>
                        <div class="price-row">
                            <div>
                                <div class="price-current" style="color:${cur >= 0 ? '#22c55e' : '#ef4444'}">$${p.currentPrice || '—'}</div>
                                <div class="price-entry">Entry: $${p.entryPrice}</div>
                            </div>
                            <span style="font-size:11px;color:#64748b">${durStr} ago</span>
                        </div>
                        <div class="price-bar"><div class="fill ${peak > 0 ? 'green' : 'red'}" style="width:${barW}%"></div></div>
                        <div class="token-details" style="margin-top:8px;">
                            <div class="item"><span>RSI</span><span class="val">${p.entryRsi || '—'}</span></div>
                            <div class="item"><span>Distance</span><span class="val">${p.entryDistance || '—'}</span></div>
                            ${p.entryReason ? `<div class="item" style="grid-column:1/3"><span>Entry</span><span class="val" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.entryReason}">${p.entryReason}</span></div>` : ''}
                        </div>
                    </div>
                `;
            }).join('') || '<div class="loader">No data</div>';
        }

        // ═══ ROTATION RENDER ═══
        function renderRotation() {
            const active = rotationData.filter(h => h.status === 'active');
            const closed = rotationData.filter(h => h.status === 'closed');
            const withPnl = closed.filter(h => h.pnl !== undefined);
            const totalPnl = withPnl.reduce((s, h) => s + h.pnl, 0);
            const activePnl = active.reduce((s, h) => {
                const p = h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice) * 100 : 0;
                return s + p;
            }, 0);

            document.getElementById('rotationStats').innerHTML = `
                <div class="stat">
                    <div class="label">Active</div>
                    <div class="value" style="color:#22c55e">${active.length}</div>
                </div>
                <div class="stat">
                    <div class="label">Total Trades</div>
                    <div class="value" style="color:#a78bfa">${rotationData.length}</div>
                </div>
                <div class="stat">
                    <div class="label">Closed PnL</div>
                    <div class="value" style="color:${totalPnl >= 0 ? '#22c55e' : '#ef4444'}">${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%</div>
                </div>
                <div class="stat">
                    <div class="label">Active PnL</div>
                    <div class="value" style="color:${activePnl >= 0 ? '#22c55e' : '#ef4444'}">${activePnl >= 0 ? '+' : ''}${activePnl.toFixed(2)}%</div>
                </div>
            `;

            let sorted = [...rotationData];
            switch (rotationSort) {
                case 'time': sorted.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime)); break;
                case 'pnl': sorted.sort((a, b) => {
                    const ap = a.pnl ?? ((a.currentPrice - a.entryPrice) / a.entryPrice * 100);
                    const bp = b.pnl ?? ((b.currentPrice - b.entryPrice) / b.entryPrice * 100);
                    return bp - ap;
                }); break;
                case 'density': sorted.sort((a, b) => (b.density || 0) - (a.density || 0)); break;
                case 'active': sorted.sort((a, b) => (b.status === 'active' ? 1 : 0) - (a.status === 'active' ? 1 : 0)); break;
            }

            document.getElementById('rotationGrid').innerHTML = sorted.slice(0, 100).map(h => {
                const pnl = h.pnl ?? (h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice) * 100 : 0);
                const cls = pnl >= 0 ? 'positive' : 'negative';
                const pnlCls = pnl >= 0 ? 'green' : 'red';
                const isActive = h.status === 'active';
                const d = h.density || 0;
                let dCls = 'low'; if (d >= 60) dCls = 'high'; else if (d >= 30) dCls = 'medium';
                const barW = Math.min(Math.abs(pnl) / 5 * 100, 100);

                return `
                    <div class="token-card ${cls}">
                        <div class="token-top">
                            <div>
                                <span class="token-symbol">${h.symbol.replace('USDT', '')}</span>
                                <span style="font-size:10px;padding:2px 6px;border-radius:6px;font-weight:700;text-transform:uppercase;${isActive ? 'background:#22c55e22;color:#22c55e' : 'background:#64748b22;color:#64748b'}">${isActive ? '● LIVE' : 'CLOSED'}</span>
                            </div>
                            <span class="token-pnl ${pnlCls}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</span>
                        </div>
                        <div class="price-row">
                            <div>
                                <div class="price-current" style="color:${pnl >= 0 ? '#22c55e' : '#ef4444'}">$${h.currentPrice || h.exitPrice || h.entryPrice}</div>
                                <div class="price-entry">Entry: $${h.entryPrice}</div>
                            </div>
                            <span class="density-badge ${dCls}">D: ${d}%</span>
                        </div>
                        <div class="price-bar"><div class="fill ${pnlCls}" style="width:${barW}%"></div></div>
                        <div class="token-details" style="margin-top:8px;">
                            ${h.reason ? `<div class="item" style="grid-column:1/3"><span>Exit</span><span class="val" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${h.reason}">${h.reason}</span></div>` : ''}
                        </div>
                    </div>
                `;
            }).join('') || '<div class="loader">No data</div>';
        }

        // ═══ TSL RENDER ═══
        function renderTsl() {
            const active = tslData.filter(h => h.status === 'active');
            const closed = tslData.filter(h => h.status === 'closed');
            const withPnl = closed.filter(h => h.pnl !== undefined);
            const totalPnl = withPnl.reduce((s, h) => s + h.pnl, 0);
            const activePnl = active.reduce((s, h) => {
                const p = h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice) * 100 : 0;
                return s + p;
            }, 0);

            document.getElementById('tslStats').innerHTML = `
                <div class="stat">
                    <div class="label">Live Active Slots</div>
                    <div class="value" style="color:#22c55e">${active.length}</div>
                </div>
                <div class="stat">
                    <div class="label">Total Trades Tracked</div>
                    <div class="value" style="color:#a78bfa">\${tslData.length}</div>
                </div>
                <div class="stat">
                    <div class="label">Total Closed PnL</div>
                    <div class="value" style="color:\${totalPnl >= 0 ? '#22c55e' : '#ef4444'}">\${totalPnl >= 0 ? '+' : ''}\${totalPnl.toFixed(2)}%</div>
                </div>
                <div class="stat">
                    <div class="label">Unrealized PnL (Net)</div>
                    <div class="value" style="color:${activePnl >= 0 ? '#22c55e' : '#ef4444'}">${activePnl >= 0 ? '+' : ''}${activePnl.toFixed(2)}%</div>
                </div>
            `;

            let sorted = [...tslData];
            switch (tslSort) {
                case 'time': sorted.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime)); break;
                case 'pnl': sorted.sort((a, b) => {
                    const ap = a.pnl ?? ((a.currentPrice - a.entryPrice) / a.entryPrice * 100);
                    const bp = b.pnl ?? ((b.currentPrice - b.entryPrice) / b.entryPrice * 100);
                    return bp - ap;
                }); break;
                case 'density': sorted.sort((a, b) => (b.density || 0) - (a.density || 0)); break;
                case 'active': sorted.sort((a, b) => (b.status === 'active' ? 1 : 0) - (a.status === 'active' ? 1 : 0)); break;
            }

            document.getElementById('tslGrid').innerHTML = sorted.slice(0, 100).map(h => {
                const pnl = h.pnl ?? (h.currentPrice ? ((h.currentPrice - h.entryPrice) / h.entryPrice) * 100 : 0);
                const cls = pnl >= 0 ? 'positive' : 'negative';
                const pnlCls = pnl >= 0 ? 'green' : 'red';
                const isActive = h.status === 'active';
                const d = h.density || 0;
                let dCls = 'low'; if (d >= 60) dCls = 'high'; else if (d >= 30) dCls = 'medium';
                const barW = Math.min(Math.abs(pnl) / 5 * 100, 100);

                let badgeHtml = '';
                if (isActive) {
                     badgeHtml = h.tier > 1 ? \`<span style="font-size:10px;padding:2px 6px;border-radius:6px;font-weight:700;text-transform:uppercase;background:#a78bfa44;color:#a78bfa">🚀 TIER ${h.tier} TSL</span>\` : \`<span style="font-size:10px;padding:2px 6px;border-radius:6px;font-weight:700;text-transform:uppercase;background:#22c55e22;color:#22c55e">● LIVE</span>\`;
                } else {
                     badgeHtml = '<span style="font-size:10px;padding:2px 6px;border-radius:6px;font-weight:700;text-transform:uppercase;background:#64748b22;color:#64748b">CLOSED</span>';
                }

                return `
                    <div class="token-card ${cls}">
                        <div class="token-top">
                            <div>
                                <span class="token-symbol">${h.symbol.replace('USDT', '')}</span>
                                \${badgeHtml}
                            </div>
                            <span class="token-pnl \${pnlCls}">\${pnl >= 0 ? '+' : ''}\${pnl.toFixed(2)}%</span>
                        </div>
                        <div class="price-row">
                            <div>
                                <div class="price-current" style="color:\${pnl >= 0 ? '#22c55e' : '#ef4444'}">$\${h.currentPrice || h.exitPrice || h.entryPrice}</div>
                                <div class="price-entry">Entry: $\${h.entryPrice}</div>
                            </div>
                            <span class="density-badge \${dCls}">D: \${d}%</span>
                        </div>
                        <div class="price-bar"><div class="fill \${pnlCls}" style="width:\${barW}%"></div></div>
                        <div class="token-details" style="margin-top:8px;">
                            <div class="item"><span>Risk Type</span><span class="val">SL -5% / Trail 5-15%</span></div>
                            ${h.reason ? `<div class="item" style="grid-column:1/3"><span>Exit</span><span class="val" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${h.reason}">${h.reason}</span></div>` : ''}
                        </div>
                    </div>
                `;
            }).join('') || '<div class="loader">Waiting for TSL Scanner to find entries...</div>';
        }

        // Auto-refresh
        loadAll();
        setInterval(loadAll, 15000);
    