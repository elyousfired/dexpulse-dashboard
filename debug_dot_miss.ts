
import axios from 'axios';
import { fetchWeeklyVwapData } from './services/cexService.ts';

async function debugDot() {
    const symbol = 'DOTUSDT';
    const vwap = await fetchWeeklyVwapData(symbol);
    if (!vwap) {
        console.log("Could not fetch VWAP for DOT");
        return;
    }

    const lastClose = vwap.last15mClose;
    const prevClose = vwap.prev15mClose;
    const max = vwap.max;

    console.log(`DOT Status:`);
    console.log(`Last Close: $${lastClose}`);
    console.log(`Prev Close: $${prevClose}`);
    console.log(`Weekly Max: $${max}`);

    const cond1 = lastClose > vwap.prevWeekVwap;
    const cond2 = lastClose > vwap.currentWeekVwap;
    const cond3 = lastClose > vwap.max;
    const cond4 = vwap.currentWeekVwap > vwap.prevWeekVwap;
    const volatility = (Math.abs(vwap.max - vwap.min) / lastClose);
    const cond5 = volatility > 0.02;
    const cond6 = lastClose > vwap.max && prevClose <= vwap.max;

    console.log(`\nConditions:`);
    console.log(`1. > Prev Week VWAP: ${cond1}`);
    console.log(`2. > Curr Week VWAP: ${cond2}`);
    console.log(`3. > Weekly Max: ${cond3}`);
    console.log(`4. Curr > Prev VWAP: ${cond4}`);
    console.log(`5. Volatility (${(volatility * 100).toFixed(2)}%) > 2%: ${cond5}`);
    console.log(`6. BREAKOUT (Current > Max AND Previous <= Max): ${cond6}`);

    if (cond1 && cond2 && cond3 && cond4 && cond5 && cond6) {
        console.log("\n✅ SHOULD BE IN TERMINAL");
    } else if (cond1 && cond2 && cond3 && cond4 && cond5 && !cond6) {
        console.log("\n⚠️ ALREADY ABOVE MAX (No new breakout trigger)");
    } else {
        console.log("\n❌ NOT A FULL GOLDEN SIGNAL");
    }
}

debugDot();
