import { test, expect } from "@playwright/test";

test.describe("Trading Gym E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto("/login");

    // Login using test credentials
    await page.fill('input[type="email"]', "chandresh.code@gmail.com");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');

    // Wait for redirection to dashboard/home page
    await page.waitForURL("**/");
  });

  test("should navigate to Gym, start training, place limit/market orders, and sync split-view", async ({ page }) => {
    // 1. Navigate to Gym page
    await page.goto("/gym");
    await expect(page.locator("h1")).toContainText("Trading Gym");

    // 2. Start a new session if not recovered automatically
    const startButton = page.locator('button:has-text("Start Training")');
    if (await startButton.isVisible()) {
      await startButton.click();
    }

    // Wait for the chart/session to be loaded
    await expect(page.locator("h1")).toContainText("Trading Gym");
    await expect(page.locator('button:has-text("Reveal & End")')).toBeVisible();

    // 3. Test Order Type Toggle & Inputs
    // Verify default order type is MARKET and check fields
    await expect(page.locator('button:has-text("Place LONG MARKET Order")')).toBeVisible();
    await expect(page.locator('label:has-text("Limit Entry Price")')).not.toBeVisible();

    // Toggle to Limit
    await page.click('button:has-text("Limit")');
    await expect(page.locator('label:has-text("Limit Entry Price")')).toBeVisible();
    await expect(page.locator('button:has-text("Place LONG LIMIT Order")')).toBeVisible();

    // 4. Place a Pending Limit Order and Cancel it
    // Set a very low limit price to ensure it doesn't get filled immediately
    const currentPriceText = await page.locator("div.text-sm.font-medium:has-text('Price:')").innerText();
    const currentPrice = parseFloat(currentPriceText.replace("Price:", "").trim());
    
    const limitPrice = (currentPrice * 0.9).toFixed(2);
    const stopLoss = (currentPrice * 0.85).toFixed(2);
    const takeProfit = (currentPrice * 0.95).toFixed(2);

    await page.fill('label:has-text("Limit Entry Price") + input', limitPrice);
    await page.fill('label:has-text("Stop Loss") + input', stopLoss);
    await page.fill('label:has-text("Take Profit") + input', takeProfit);

    await page.click('button:has-text("Place LONG LIMIT Order")');

    // Verify limit order pending status UI
    await expect(page.locator('span:has-text("PENDING")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel Limit Order")')).toBeVisible();

    // Cancel the limit order
    await page.click('button:has-text("Cancel Limit Order")');
    await expect(page.locator('button:has-text("Place LONG MARKET Order")')).toBeVisible();

    // 5. Place a Market Order & Close Trade
    await page.click('button:has-text("Market")');
    await page.click('button:has-text("Place LONG MARKET Order")');

    // Verify trade is open
    await expect(page.locator('h3:has-text("Open Trade")')).toBeVisible();
    await expect(page.locator('button:has-text("Close at")')).toBeVisible();

    // Advance time (+5 candles)
    await page.click('button:has-text("+5")');

    // Close the trade
    await page.click('button:has-text("Close at")');

    // Verify trade shows in History
    await expect(page.locator('h3:has-text("Trade History")')).toBeVisible();
    await expect(page.locator('div:has-text("LONG")')).toBeVisible();

    // 6. Test Split View / Multi-Chart Synchronization
    await page.click('button:has-text("Split View")');
    await expect(page.locator('span:has-text("LOWER TIMEFRAME")')).toBeVisible();
    await expect(page.locator('span:has-text("MAIN TIMEFRAME")')).toBeVisible();
    await expect(page.locator('span:has-text("HIGHER TIMEFRAME")')).toBeVisible();

    // Toggle back to single view
    await page.click('button:has-text("Single View")');
    await expect(page.locator('span:has-text("LOWER TIMEFRAME")')).not.toBeVisible();

    // 7. Reveal symbol and end session
    await page.click('button:has-text("Reveal & End")');
    await expect(page.locator('h3:has-text("Session Revealed")')).toBeVisible();
    await expect(page.locator('span:has-text("REVEALED")')).toBeVisible();
  });
});
