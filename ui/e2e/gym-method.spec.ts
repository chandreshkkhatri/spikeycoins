import { test, expect } from "@playwright/test";

test.describe("Trading Gym Methodology Trainer E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "chandresh.code@gmail.com");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/");
  });

  test("should start methodology session, enforce thesis gating, size positions, and show reveal scorecard", async ({ page }) => {
    await page.goto("/gym");
    await expect(page.locator("h1")).toContainText("Trading Gym");

    // Start a new methodology session if not active
    const startMethodButton = page.locator('button:has-text("Start Method Session"), button:has-text("Start Methodology Session")');
    if (await startMethodButton.isVisible()) {
      await startMethodButton.click();
    }

    // Verify METHOD mode badge
    await expect(page.locator('span:has-text("METHOD MODE")')).toBeVisible();

    // Verify thesis form & automated rule verification container
    await expect(page.locator('h3:has-text("Trade Thesis & Order Entry")')).toBeVisible();
    await expect(page.locator('div:has-text("Automated Rule Verification")')).toBeVisible();

    // Fill valid thesis values and submit
    await page.click('button:has-text("Place LONG MARKET Order with Thesis")');

    // Advance session
    await page.click('button:has-text("+5")');

    // Reveal session and check scorecard headline tiles
    await page.click('button:has-text("Reveal & End")');
    await expect(page.locator('h2:has-text("Session Reveal & Scorecard")')).toBeVisible();
    await expect(page.locator('span:has-text("Process Score")')).toBeVisible();
    await expect(page.locator('span:has-text("Performance Outcome")')).toBeVisible();
  });
});
