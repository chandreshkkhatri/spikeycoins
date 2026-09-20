import { test, expect } from "@playwright/test";

test("research drafts are not presented as published and source HTML is isolated", async ({ page }) => {
  const user = { _id: "research-fixture", email: "fixture@example.com", name: "Fixture" };
  await page.addInitScript(user => {
    localStorage.setItem("spikeyCoins_user", JSON.stringify(user));
    localStorage.setItem("spikeyCoins_accessToken", "fixture." + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + ".fixture");
  }, user);
  await page.routeWebSocket(/.*/, socket => socket.close());
  const unexpectedWrites: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin/research/BTCUSDT")) return route.fulfill({ json: {
      success: true, summary: { publicationStatus: "draft", publicationReason: "Missing grounding", headline: "Unverified" },
    } });
    if (route.request().method() !== "GET") unexpectedWrites.push(path);
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { success: true, user } });
    if (path.endsWith("/admin/status")) return route.fulfill({ json: { success: true, isAdmin: true } });
    if (path.endsWith("/ticker/24hr")) return route.fulfill({ json: { data: [
      { s: "BTCUSDT", price: 100, change_24h: 2, high_24h: 110, low_24h: 90, volume_usd: 1000000 },
    ] } });
    if (path.endsWith("/summaries")) return route.fulfill({ json: { success: true, data: [{
      id: "fixture-story", title: "Grounded fixture", summary: "Fixture research.",
      sources: [{ type: "grounded", url: "https://example.com/announcement", title: "Announcement" }],
      searchEntryPoint: '<script>parent.document.body.dataset.groundingEscape = "yes"</script><a href="https://google.com/search?q=fixture" target="_blank">Search fixture</a>',
      impact: "low", category: "Technical Upgrade",
    }] } });
    return route.fulfill({ json: { success: true, data: [], accounts: [], symbols: [] } });
  });
  await page.goto("/market-watch/screener");
  await page.getByRole("button", { name: "Research BTCUSDT" }).click();
  await expect(page.getByText(/Research saved as draft—not published/)).toBeVisible();
  await page.goto("/market-watch");
  await page.getByRole("button", { name: "See more", exact: true }).click();
  const frame = page.locator('iframe[title="Google Search suggestions"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
  await expect(page.frameLocator('iframe[title="Google Search suggestions"]').getByText("Search fixture")).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.groundingEscape)).toBeUndefined();
  expect(unexpectedWrites).toEqual([]);
});
