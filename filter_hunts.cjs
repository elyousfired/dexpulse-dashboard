const fs = require('fs');
const path = require('path');

const huntsFile = 'c:\\Users\\REDOUAN\\Downloads\\dexpulse-boosted-dashboard\\server\\data\\active_hunts.json';
const data = JSON.parse(fs.readFileSync(huntsFile, 'utf8'));

const filtered = data.filter(h => h.strategyId === 'vwap_tsl');
console.log('Total trades found:', filtered.length);
fs.writeFileSync('c:\\Users\\REDOUAN\\Downloads\\dexpulse-boosted-dashboard\\turbo_tsl_trades_full.json', JSON.stringify(filtered, null, 2));