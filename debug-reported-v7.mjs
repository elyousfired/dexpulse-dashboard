
async function fetchBinanceKlines(symbol, interval, limit) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            quoteVolume: parseFloat(d[7])
        }));
    } catch (e) { return null; }
}

async function debugReportedTokens() {
    console.log("--- DIAGNOSTIC OF REPORTED TOKENS (FEB 27) ---");
    const symbols = ['DOTUSDT', 'VIRTUALUSDT', 'PENDLEUSDT', 'MORPHOUSDT', 'MIRAUSDT', 'ZBTUSDT'];
    const startOfTodayTs = Date.UTC(2026, 1, 27, 0, 0, 0);

    const getMonTs = (ts) => {
        const d = new Date(ts);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        const mon = new Date(ts);
        mon.setUTCHours(0, 0, 0, 0);
        mon.setUTCDate(mon.getUTCDate() - diff);
        return Math.floor(mon.getTime() / 1000);
    };

    const monTs = getMonTs(Date.now());
    const prevMonTs = monTs - (7 * 24 * 3600);

    for (const s of symbols) {
        process.stdout.write(`Analyzing ${s}... `);
        const [k1d, k15m] = await Promise.all([
            fetchBinanceKlines(s, '1d', 40),
            fetchBinanceKlines(s, '15m', 500)
        ]);

        if (!k1d || !k15m) {
            console.log("Not found or missing data on Binance.");
            continue;
        }

        // 1. Weekly Max
        let wMax = -Infinity, wMin = Infinity;
        const dailyVwaps = k1d.map(k => (k.volume > 0 ? k.quoteVolume / k.volume : k.close));
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                if (dailyVwaps[idx] > wMax) wMax = dailyVwaps[idx];
                if (dailyVwaps[idx] < wMin) wMin = dailyVwaps[idx];
            }
        });

        // 2. Weekly VWAPs
        let pQ = 0, pB = 0, qWeek = 0, bWeek = 0;
        k1d.forEach((k, idx) => {
            if (getMonTs(k.time) === prevMonTs) {
                pQ += k.quoteVolume; pB += k.volume;
            } else if (getMonTs(k.time) === monTs && idx < k1d.length - 1) {
                qWeek += k.quoteVolume; bWeek += k.volume;
            }
        });
        const prevWeekVwap = pB > 0 ? pQ / pB : 0;

        let qToday = 0, bToday = 0;
        let v7Signal = null;
        let cvwSignal = null;

        for (let i = 0; i < k15m.length; i++) {
            const k = k15m[i];
            if (k.time >= startOfTodayTs) {
                qToday += k.quoteVolume; bToday += k.volume;
            }
            if (k.time < startOfTodayTs || i === 0) continue;

            const cVW = (qWeek + qToday) / (bWeek + bToday);
            const price = k.close;
            const prevPrice = k15m[i - 1].close;
            const volatility = Math.abs(wMax - wMin) / price;

            // v7 Check
            const isV7 = price > prevWeekVwap && price > cVW && price > wMax && cVW > prevWeekVwap && volatility > 0.02 && price > wMax && prevPrice <= wMax;

            // User Logic Check: CVW > WMax and Price > CVW
            const isCVWBreak = cVW > wMax && price > cVW && prevPrice <= cVW;

            if (isV7 && !v7Signal) v7Signal = { time: new Date(k.time).toISOString().slice(11, 16), price };
            if (isCVWBreak && !cvwSignal) cvwSignal = { time: new Date(k.time).toISOString().slice(11, 16), price };
        }

        if (v7Signal || cvwSignal) {
            console.log("MATCH FOUND!");
            if (v7Signal) console.log(`  - [v7 Golden] at ${v7Signal.time} | Price: ${v7Signal.price}`);
            if (cvwSignal) console.log(`  - [CVW > WMax] at ${cvwSignal.time} | Price: ${cvwSignal.price}`);
        } else {
            console.log("No v7 or CVW signal found today.");
        }
    }
}

debugReportedTokens();
