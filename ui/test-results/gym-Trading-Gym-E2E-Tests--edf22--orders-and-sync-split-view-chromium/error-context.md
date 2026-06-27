# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gym.spec.ts >> Trading Gym E2E Tests >> should navigate to Gym, start training, place limit/market orders, and sync split-view
- Location: e2e/gym.spec.ts:17:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('span:has-text("PENDING")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('span:has-text("PENDING")')

```

```yaml
- banner:
  - link "Spikey Coins Spikey Coins":
    - /url: /command-center
    - img "Spikey Coins"
    - text: Spikey Coins
  - navigation:
    - link "Command Center":
      - /url: /command-center
    - link "Terminal":
      - /url: /terminal
    - link "Journal":
      - /url: /journal
    - link "Gym":
      - /url: /gym
    - link "Market Watch":
      - /url: /market-watch
    - link "Portfolio":
      - /url: /portfolio
    - link "Brokers":
      - /url: /brokers
  - text: Equity $0.00
  - button [disabled]
  - button "Toggle theme": 🌙
  - button "Chandresh Kumar Chandresh Kumar":
    - img "Chandresh Kumar"
    - text: Chandresh Kumar
- main:
  - heading "Trading Gym" [level=1]
  - text: 15m +0.00%
  - button "Split View"
  - button "Exit"
  - button "New"
  - text: "Candle 50/300 (250 remaining) Price: 8485.16"
  - table:
    - row:
      - cell
      - cell:
        - link "Charting by TradingView":
          - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=localhost/gym
          - img
      - cell
    - row:
      - cell
      - cell
      - cell
  - heading "Advance Time" [level=3]
  - button "+1"
  - button "+5"
  - button "+10"
  - button "Reveal & End"
  - heading "Pending Limit" [level=3]
  - text: "LONG PENDING Limit Price: 7636.64 SL: 7212.39 TP: 8060.90"
  - button "Cancel Limit Order"
  - heading "Trade History (0)" [level=3]
  - paragraph: No trades yet
- alert
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Trading Gym E2E Tests", () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     // Navigate to login page
  6  |     await page.goto("/login");
  7  | 
  8  |     // Login using test credentials
  9  |     await page.fill('input[type="email"]', "chandresh.code@gmail.com");
  10 |     await page.fill('input[type="password"]', "password123");
  11 |     await page.click('button[type="submit"]');
  12 | 
  13 |     // Wait for redirection to dashboard/home page
  14 |     await page.waitForURL("**/");
  15 |   });
  16 | 
  17 |   test("should navigate to Gym, start training, place limit/market orders, and sync split-view", async ({ page }) => {
  18 |     // 1. Navigate to Gym page
  19 |     await page.goto("/gym");
  20 |     await expect(page.locator("h1")).toContainText("Trading Gym");
  21 | 
  22 |     // 2. Start a new session if not recovered automatically
  23 |     const startButton = page.locator('button:has-text("Start Training")');
  24 |     if (await startButton.isVisible()) {
  25 |       await startButton.click();
  26 |     }
  27 | 
  28 |     // Wait for the chart/session to be loaded
  29 |     await expect(page.locator("h1")).toContainText("Trading Gym");
  30 |     await expect(page.locator('button:has-text("Reveal & End")')).toBeVisible();
  31 | 
  32 |     // 3. Test Order Type Toggle & Inputs
  33 |     // Verify default order type is MARKET and check fields
  34 |     await expect(page.locator('button:has-text("Place LONG MARKET Order")')).toBeVisible();
  35 |     await expect(page.locator('label:has-text("Limit Entry Price")')).not.toBeVisible();
  36 | 
  37 |     // Toggle to Limit
  38 |     await page.click('button:has-text("Limit")');
  39 |     await expect(page.locator('label:has-text("Limit Entry Price")')).toBeVisible();
  40 |     await expect(page.locator('button:has-text("Place LONG LIMIT Order")')).toBeVisible();
  41 | 
  42 |     // 4. Place a Pending Limit Order and Cancel it
  43 |     // Set a very low limit price to ensure it doesn't get filled immediately
  44 |     const currentPriceText = await page.locator("div.text-sm.font-medium:has-text('Price:')").innerText();
  45 |     const currentPrice = parseFloat(currentPriceText.replace("Price:", "").trim());
  46 |     
  47 |     const limitPrice = (currentPrice * 0.9).toFixed(2);
  48 |     const stopLoss = (currentPrice * 0.85).toFixed(2);
  49 |     const takeProfit = (currentPrice * 0.95).toFixed(2);
  50 | 
  51 |     await page.fill('label:has-text("Limit Entry Price") + input', limitPrice);
  52 |     await page.fill('label:has-text("Stop Loss") + input', stopLoss);
  53 |     await page.fill('label:has-text("Take Profit") + input', takeProfit);
  54 | 
  55 |     await page.click('button:has-text("Place LONG LIMIT Order")');
  56 | 
  57 |     // Verify limit order pending status UI
> 58 |     await expect(page.locator('span:has-text("PENDING")')).toBeVisible();
     |                                                            ^ Error: expect(locator).toBeVisible() failed
  59 |     await expect(page.locator('button:has-text("Cancel Limit Order")')).toBeVisible();
  60 | 
  61 |     // Cancel the limit order
  62 |     await page.click('button:has-text("Cancel Limit Order")');
  63 |     await expect(page.locator('button:has-text("Place LONG MARKET Order")')).toBeVisible();
  64 | 
  65 |     // 5. Place a Market Order & Close Trade
  66 |     await page.click('button:has-text("Market")');
  67 |     await page.click('button:has-text("Place LONG MARKET Order")');
  68 | 
  69 |     // Verify trade is open
  70 |     await expect(page.locator('h3:has-text("Open Trade")')).toBeVisible();
  71 |     await expect(page.locator('button:has-text("Close at")')).toBeVisible();
  72 | 
  73 |     // Advance time (+5 candles)
  74 |     await page.click('button:has-text("+5")');
  75 | 
  76 |     // Close the trade
  77 |     await page.click('button:has-text("Close at")');
  78 | 
  79 |     // Verify trade shows in History
  80 |     await expect(page.locator('h3:has-text("Trade History")')).toBeVisible();
  81 |     await expect(page.locator('div:has-text("LONG")')).toBeVisible();
  82 | 
  83 |     // 6. Test Split View / Multi-Chart Synchronization
  84 |     await page.click('button:has-text("Split View")');
  85 |     await expect(page.locator('span:has-text("LOWER TIMEFRAME")')).toBeVisible();
  86 |     await expect(page.locator('span:has-text("MAIN TIMEFRAME")')).toBeVisible();
  87 |     await expect(page.locator('span:has-text("HIGHER TIMEFRAME")')).toBeVisible();
  88 | 
  89 |     // Toggle back to single view
  90 |     await page.click('button:has-text("Single View")');
  91 |     await expect(page.locator('span:has-text("LOWER TIMEFRAME")')).not.toBeVisible();
  92 | 
  93 |     // 7. Reveal symbol and end session
  94 |     await page.click('button:has-text("Reveal & End")');
  95 |     await expect(page.locator('h3:has-text("Session Revealed")')).toBeVisible();
  96 |     await expect(page.locator('span:has-text("REVEALED")')).toBeVisible();
  97 |   });
  98 | });
  99 | 
```