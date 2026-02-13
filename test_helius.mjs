
const HELIUS_API_KEY = '4dd6a8a9-5f58-432a-a44c-2c74ff329f5b';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

async function testHelius() {
    console.log("Testing Helius API...");

    // Test 1: Get TPS
    try {
        const tpsResponse = await fetch(HELIUS_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'perf',
                method: 'getRecentPerformanceSamples',
                params: [1]
            }),
        });

        if (!tpsResponse.ok) {
            console.error("TPS Request Failed:", tpsResponse.status, tpsResponse.statusText);
            const text = await tpsResponse.text();
            console.error("Body:", text);
        } else {
            const data = await tpsResponse.json();
            console.log("TPS Data:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("TPS Fetch Error:", e);
    }

    // Test 2: Get Asset (using a known Solana token: USDC)
    const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    try {
        const assetResponse = await fetch(HELIUS_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'getAsset',
                params: { id: USDC_MINT }
            }),
        });

        if (!assetResponse.ok) {
            console.error("Asset Request Failed:", assetResponse.status, assetResponse.statusText);
            const text = await assetResponse.text();
            console.error("Body:", text);
        } else {
            const data = await assetResponse.json();
            console.log("Asset Data (Snippet):", JSON.stringify(data.result?.compression || data.result?.grouping || "Access successful", null, 2));
            if (data.error) console.error("RPC Error:", data.error);
        }
    } catch (e) {
        console.error("Asset Fetch Error:", e);
    }
}

testHelius();
