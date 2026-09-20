import { test, expect } from "@playwright/test";

for (const loggedIn of [false, true]) {
test(`mobile scan retains context through details, Terminal, and an outage (authenticated: ${loggedIn})`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket(/.*/, socket => socket.close());
  const user = { _id: "fixture-user", email: "fixture@example.com", name: "Fixture User" };
  if (loggedIn) await page.addInitScript(user => {
    localStorage.setItem("spikeyCoins_user", JSON.stringify(user));
    localStorage.setItem("spikeyCoins_accessToken", "fixture." + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + ".fixture");
  }, user);
  let outage = false;
  let saved: unknown = null;
  const adminRequests: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin/status")) adminRequests.push(path);
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith("/accounts")) return route.fulfill({ json: { success: true, accounts: loggedIn ? [
      { _id: "fixture-account", accountType: "binance", accountName: "Fixture", isActive: true },
    ] : [] } });
    if (path.endsWith("/watchlist/symbols") && route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { success: true } });
    }
    if (path.endsWith("/ticker/24hr")) {
      return route.fulfill({ status: outage ? 503 : 200, json: { data: [
        { s: "BTCUSDT", price: 100, change_24h: -2, high_24h: 110, low_24h: 90, volume_usd: 1000000, range_position_24h: 50 },
        { s: "ETHUSDT", price: 50, change_24h: 3, high_24h: 60, low_24h: 40, volume_usd: 800000, range_position_24h: 50 },
      ] } });
    }
    if (path.endsWith("/ticker/7d")) return route.fulfill({ json: { data: {
      gainers: [{ symbol: "ETH", change_7d: 5 }],
      losers: [{ symbol: "BTC", change_7d: -10 }],
    } } });
    return route.fulfill({ json: { success: true, data: [], accounts: [], symbols: [] } });
  });
  await page.goto("/market-watch/screener?direction=losers&timeframe=7d");
  await expect(page.getByText(/since 00:00 UTC seven days ago, not a rolling 168-hour return/)).toBeVisible();
  await expect(page.getByText("BTC/USDT", { exact: true })).toBeVisible();
  await expect(page.getByText("ETH/USDT", { exact: true })).toHaveCount(0);
  if (!loggedIn) expect(adminRequests).toEqual([]);
  await page.getByLabel("Minimum 24h volume (USD)").fill("1000000");
  await page.getByLabel("Minimum 7d move (%)").fill("10");
  await expect(page.getByText("BTC/USDT", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "BTC/USDT" })).toBeVisible();
  if (loggedIn) {
    await page.getByRole("button", { name: "Add to watchlist", exact: true }).click();
    await expect(page.getByText(/added to your watchlist/)).toBeVisible();
    expect(saved).toEqual({ accountId: "fixture-account", marketType: "binance-futures", symbol: "BTCUSDT" });
  }
  await page.getByRole("button", { name: "Open in Terminal", exact: true }).click();
  await expect(page).toHaveURL(/\/terminal\?symbol=BTCUSDT/);
  await page.getByRole("link", { name: "Back to Market Watch scan" }).click();
  await expect(page.getByRole("heading", { name: "BTC/USDT" })).toBeVisible();
  await expect(page.getByPlaceholder("Search pairs...")).toHaveValue("");
  await expect(page.getByLabel("Minimum 24h volume (USD)")).toHaveValue("1000000");
  await expect(page.getByLabel("Minimum 7d move (%)")).toHaveValue("10");
  outage = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText(/Market feed update failed/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "BTC/USDT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "24h", exact: true })).toBeVisible();
  if (!loggedIn) {
    await page.getByRole("button", { name: "Sign in to save", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  }
});
}
