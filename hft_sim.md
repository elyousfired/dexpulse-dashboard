# Order Book HFT Simulation (Binance Fees)
A simulation of a High-Frequency Trading (Scalping) bot taking **500 trades**.

## Strategy Variables
- **Starting Capital:** $1000.0
- **Win Rate:** 65.0%
- **Take Profit (Gross):** +0.30%
- **Stop Loss (Gross):** -0.15%
- **Binance Fees (Taker + Maker):** 0.20%

## The Reality of Fees (The HFT Trap)
- **Actual Win (Net):** +0.10% (You lose 67% of your profit to Binance)
- **Actual Loss (Net):** -0.35% (Your loss is more than doubled because of fees!)

## Simulation Results
- **Total Trades:** 500
- **Wins:** 325
- **Losses:** 175
- **Final Capital:** $749.21
- **Total ROI:** -25.08%

> [!WARNING]
> **Verdict: Rekt by Fees!** Despite a 65% win rate, the Binance fees completely destroyed the account. This shows why HFT requires 0-fee pairing (like USDC pairs on Binance) or institutional VIP fee tiers.