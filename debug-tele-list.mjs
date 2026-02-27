
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.map(d => ({
            time: d[0] / 1000,
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7]),
            close: parseFloat(d[4])
        }));
    } catch (e) { return []; }
}

async function debugTelegramList() {
    const list = ["VIRTUAL", "WLD", "GUN", "KSM", "PENDLE", "BARD", "FOGO", "JST", "DENT", "KITE", "WBETH", "SKY"];
    console.log(`--- ANALYZING TELEGRAM LIST (v7 CHECK) ---`);

    // Helper for Monday Calculation
    const getMonTs = (ts) => {
        const d = new Date(ts * 1000);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts * 1000);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const nowTs = Math.floor(Date.now() / 1000);
    const mondayTs = getMonTs(nowTs);
    const prevMondayTs = mondayTs - (7 * 24 * 3600);

    for (const s of list) {
        const symbol = s + "USDT";
        const k1d = await fetchBinanceKlines(symbol, '1d', 30);
        const k15m = await fetchBinanceKlines(symbol, '15m', 5);
        if (k1d.length < 15 || k15m.length < 2) continue;

        const lastClose = k15m[k15m.length - 1].close;
        const prevClose = k15m[k15m.length - 2].close;

        let wMax = -Infinity, wMin = Infinity;
        const rawVwap = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, index) => {
            const dailyVwap = rawVwap[index];
            if (getMonTs(k.time) === mondayTs && index < k1d.length - 1) {
                if (dailyVwap > wMax) wMax = dailyVwap;
                if (dailyVwap < wMin) wMin = dailyVwap;
            }
        });

        let pQ = 0, pB = 0, cQ = 0, cB = 0;
        k1d.forEach(k => {
            const kMon = getMonTs(k.time);
            if (kMon === prevMondayTs) { pQ += k.quoteVolume; pB += k.volume; }
            else if (kMon === mondayTs) { cQ += k.quoteVolume; cB += k.volume; }
        });
        const pVW = pB > 0 ? pQ / pB : 0;
        const cVW = cB > 0 ? cQ / cB : rawVwap[rawVwap.length - 1];

        const c1 = lastClose > pVW;
        const c2 = lastClose > cVW;
        const c3 = lastClose > wMax;
        const c4 = cVW > pVW;
        const vol = (Math.abs(wMax - wMin) / lastClose) > 0.02;
        const fresh = lastClose > wMax && prevClose <= wMax;

        const status = (c1 && c2 && c3 && c4 && vol && fresh) ? "✅ GOLDEN" : "❌ FAILED";
        console.log(`${s}: ${status} | Price: $${lastClose} | Vol: ${((Math.abs(wMax - wMin) / lastClose) * 100).toFixed(2)}% | Fresh: ${fresh}`);
        if (status === "❌ FAILED") {
            const fails = [];
            if (!c1) fails.push("P.VWAP");
            if (!c2) fails.push("C.VWAP");
            if (!c3) fails.push("WMax");
            if (!c4) fails.push("Trend");
            if (!vol) fails.push("Vol<2%");
            if (!fresh) fails.push("NotFresh");
            console.log(`   Reasons: ${fails.join(", ")}`);
        }
    }
}

debugTelegramList();
