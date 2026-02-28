
import { processActiveHunts } from './server/strategyTracker.ts';

async function test() {
    console.log('--- TEST: Starting Strategy Tracker ---');
    await processActiveHunts();
    console.log('--- TEST: Strategy Tracker Completed ---');
}

test();
