
import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function testTelegram() {
    console.log("--- Telegram Connectivity Test ---");
    const configFile = path.join(process.cwd(), 'server', 'bot_config.json');

    if (!fs.existsSync(configFile)) {
        console.error("Error: bot_config.json not found");
        return;
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    console.log(`Using Token: ${config.botToken.substring(0, 10)}...`);
    console.log(`Using Chat ID: ${config.chatId}`);

    const message = "🎯 *DEXPULSE LIVE TEST*\n\n✅ Telegram Connection Verified.\n🚀 Ready to receive Golden Signals!";

    try {
        const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
        const response = await axios.post(url, {
            chat_id: config.chatId,
            text: message,
            parse_mode: 'Markdown'
        });

        if (response.data.ok) {
            console.log("✅ SUCCESS: Telegram message sent!");
        } else {
            console.error("❌ FAILED: Telegram API returned error:", response.data);
        }
    } catch (error) {
        if (error.response) {
            console.error("❌ FAILED: Telegram API Error:", error.response.status, error.response.data);
        } else {
            console.error("❌ FAILED: Network Error:", error.message);
        }
    }
}

testTelegram();
