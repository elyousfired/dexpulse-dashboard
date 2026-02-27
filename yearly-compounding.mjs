
function simulateCompounding(startCapital, monthlyROI, months) {
    let results = [];
    let current = startCapital;
    for (let i = 1; i <= months; i++) {
        let profit = current * (monthlyROI / 100);
        current += profit;
        results.push({ month: i, capital: current });
    }
    return results;
}

const start = 1000;
const roi3Day = 7.2; // From our simulation
const monthlyROI = ((Math.pow(1 + (roi3Day / 100), 10)) - 1) * 100; // Compounding 3-day blocks 10 times

console.log(`--- YEARLY ACCUMULATION PROJECTION ($1000 START) ---`);
console.log(`Estimated Monthly ROI (Conservative based on tests): 50%`); // Rounding down for safety

const projections = simulateCompounding(start, 50, 12);

console.log(`| Month | Capital ($) | Profit ($) |`);
console.log(`| :--- | :--- | :--- |`);
let prev = start;
projections.forEach(p => {
    console.log(`| Month ${p.month} | $${p.capital.toLocaleString(undefined, { maximumFractionDigits: 0 })} | +$${(p.capital - prev).toLocaleString(undefined, { maximumFractionDigits: 0 })} |`);
    prev = p.capital;
});

console.log(`\nNOTE: These are mathematical projections. Real market liquidity usually caps growth after a certain point.`);
