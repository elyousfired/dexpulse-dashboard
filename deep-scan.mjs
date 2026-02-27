
import fs from 'fs';
import path from 'path';

const brainRoot = 'C:\\Users\\REDOUAN\\.gemini\\antigravity\\brain';

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json') || file.includes('resolved')) {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const tokenMatch = content.match(/[0-9]{8,15}:[a-zA-Z0-9_-]{35}/);
                const chatMatch = content.match(/chatId["']?\s*:\s*["']?([0-9]{9,12})["']?/);

                if (tokenMatch || chatMatch) {
                    console.log(`FOUND in ${fullPath}:`);
                    if (tokenMatch) console.log(`  Token: ${tokenMatch[0]}`);
                    if (chatMatch) console.log(`  ChatID: ${chatMatch[1]}`);
                }
            } catch (e) { }
        }
    }
}

console.log("Starting deep scan for Telegram credentials...");
scanDir(brainRoot);
console.log("Scan complete.");
