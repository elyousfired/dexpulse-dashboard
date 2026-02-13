
const HELIUS_API_KEY = '4dd6a8a9-5f58-432a-a44c-2c74ff329f5b';
// Test against local proxy
const PROXY_URL = `http://127.0.0.1:3000/api/helius-rpc/?api-key=${HELIUS_API_KEY}`;

async function testProxy() {
    console.log("Testing Helius Proxy at " + PROXY_URL);

    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'perf',
                method: 'getRecentPerformanceSamples',
                params: [1]
            }),
        });

        if (!response.ok) {
            console.error("Proxy Request Failed:", response.status, response.statusText);
            const text = await response.text();
            console.error("Body:", text);
        } else {
            const data = await response.json();
            console.log("Proxy Success! TPS Data:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Proxy Fetch Error (Server might not be running or proxy not active):", e);
    }
}

testProxy();
