import { test, expect } from "@playwright/test";

test("Terminal blocks zero funds and recovers after a verified refresh", async ({ page }) => {
  const user = { _id: "fixture-user", email: "fixture@example.com", name: "Fixture" };
  await page.addInitScript(user => {
    localStorage.setItem("spikeyCoins_user", JSON.stringify(user));
    localStorage.setItem("spikeyCoins_accessToken", "fixture." + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + ".fixture");
  }, user);
  await page.routeWebSocket(/.*/, socket => socket.close());
  let funds = 0;
  let orderRequests = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/orders/place")) {
      orderRequests++;
      return route.fulfill({ status: 400, json: { success: false, error: "Orders prohibited in fixture" } });
    }
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith("/accounts")) return route.fulfill({ json: { success: true, accounts: [{
      _id: "fixture-account", accountType: "binance", accountName: "Fixture", isActive: true, metadata: { tradingSegment: "usdm" },
    }] } });
    if (path.includes("/watchlist/")) return route.fulfill({ json: {
      success: true, symbols: ["BTCUSDT"], items: [], watchlists: [],
    } });
    if (path.endsWith("/prices")) return route.fulfill({ json: {
      success: true, prices: { BTCUSDT: { lastPrice: 20000 } },
    } });
    if (path.endsWith("/trading/summary")) return route.fulfill({ json: {
      success: true, asOf: Date.now(), positions: [], orders: [],
      accountDetails: { equity: 5000, availableBalance: funds },
      symbolInfo: { verified: true, tickSize: "0.01", stepSize: "0.001", minQty: 0.001, minNotional: 5, maxLeverage: 20 },
    } });
    return route.fulfill({ json: { success: true, data: [], symbols: [], accounts: [] } });
  });
  await page.goto("/terminal?symbol=BTCUSDT");
  const submit = page.getByRole("button", { name: "BUY BTCUSDT", exact: true }).filter({ visible: true });
  await expect(submit).toBeDisabled();
  await expect(page.getByText("No available funds for a new position.", { exact: true }).filter({ visible: true })).toBeVisible();
  funds = 1000;
  // Poll through the short summary cache without granting cached data a new timestamp.
  await expect(async () => {
    await page.locator(".trading-header").getByRole("button", { name: "Refresh", exact: true }).filter({ visible: true }).click();
    await expect(submit).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await expect(submit).toBeEnabled();
  expect(orderRequests).toBe(0);
});
