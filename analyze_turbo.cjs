const fs = require('fs');

const huntsFile = 'c:\\Users\\REDOUAN\\Downloads\\dexpulse-boosted-dashboard\\server\\data\\active_hunts.json';
const data = JSON.parse(fs.readFileSync(huntsFile, 'utf8'));

const tslTrades = data.filter(h => h.strategyId === 'vwap_tsl');

const active = tslTrades.filter(h => h.status === 'active');
const closed = tslTrades.filter(h => h.status === 'closed');
const positive = closed.filter(h => h.pnl > 0);
const negative = closed.filter(h => h.pnl < 0);
const totalPnL = closed.reduce((sum, h) => sum + (h.pnl || 0), 0);

const bestTrade = closed.reduce((best, h) => (h.pnl > (best?.pnl || -Infinity)) ? h : best, null);
const worstTrade = closed.reduce((worst, h) => (h.pnl < (worst?.pnl || Infinity)) ? h : worst, null);

console.log('--- TURBO TSL SCIENTIFIC AUDIT ---');
console.log('Total Trades Tracked:', tslTrades.length);
console.log('Active Positions:', active.length);
console.log('Closed Positions:', closed.length);
console.log('Win Rate:', ((positive.length / closed.length) * 100).toFixed(2) + '%');
console.log('Total Closed PnL:', totalPnL.toFixed(2) + '%');
console.log('Avg PnL per Trade:', (totalPnL / closed.length).toFixed(2) + '%');
console.log('Best Trade:', bestTrade.symbol, bestTrade.pnl.toFixed(2) + '%');
console.log('Worst Trade:', worstTrade.symbol, worstTrade.pnl.toFixed(2) + '%');
console.log('--- END AUDIT ---');
