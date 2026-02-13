
# Deployment Guide: Going Live 🚀

There are two ways to deploy Dexpulse depending on how much of the "AI Agent" power you want to keep online.

## Option 1: Vercel (Fast, Free, & Easiest) ⭐️ RECOMMENDED
Perfect for hosting the **DEXPulse Dashboard**, **CEX Charts**, and **AI Verdicts**.
- **Works**: Real-time Tickers, Charts, Security Scanning, AI Verdicts.
- **Limitation**: The "Antfarm AI" dashboard won't work because it requires a local Node.js process and SQLite database.

### 1. Push to GitHub
If you haven't already:
```bash
git init
git add .
git commit -m "initial commit"
# Create a repo on GitHub and follow instructions to push
```

### 2. Connect to Vercel
1. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
2. Import your GitHub repository.
3. **Environment Variables**: Add these in the Vercel Dashboard:
   - `VITE_GEMINI_API_KEY`: Your Google Gemini key.
   - `BIRDEYE_API_KEY`: (If you use Birdeye features).
4. Click **Deploy**.

---

## Option 2: VPS (DigitalOcean / Render / Railway)
Perfect if you want **EVERYTHING** (including the Antfarm AI Agent) to run 24/7 on a real server.

### 1. Configuration
You will need a provider that supports Node.js servers (not just static sites). 
- **Render.com**: Choose "Web Service".
- **Railway.app**: Connect GitHub and it will auto-detect.

### 2. Build Command
Use: `npm run build`
### 3. Start Command
Use: `npm run dev` (or specialized `node server/proxy.ts` + serving `dist`).

---

## Important Secrets 🤫
Make sure your `.env` keys are added to your hosting provider's dashboard:
- `GEMINI_API_KEY` (or `VITE_GEMINI_API_KEY`)
- `HELIUS_API_KEY`

---
> [!TIP]
> **I've added a `vercel.json` to your project** to help with routing if you choose Option 1!
