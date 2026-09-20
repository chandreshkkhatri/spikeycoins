import { describe, expect, it } from "vitest";
import { directionalMovers, eligibleResearchTicker, retainResearchHorizons, RESEARCH_MAX_AGE_MS } from "./researchCandidates";
const now = Date.parse("2026-09-20T18:00:00Z");
const ticker = { s: "BTCUSDT", price: 100, change_24h: 2, volume_usd: 1000,
  last_updated: new Date(now).toISOString(), is_futures: false };
describe("research candidate policy", () => {
  it("preserves inclusive turnover floors without claiming executable liquidity", () => {
    expect(eligibleResearchTicker(ticker, now)).toBe(true);
    expect(eligibleResearchTicker({ ...ticker, volume_usd: 999 }, now)).toBe(false);
    expect(eligibleResearchTicker({ ...ticker, is_futures: true }, now)).toBe(false);
    expect(eligibleResearchTicker({ ...ticker, is_futures: true, volume_usd: 50000 }, now)).toBe(true);
  });
  it.each([
    { last_updated: "" }, { last_updated: new Date(now + 1).toISOString() },
    { last_updated: new Date(now - RESEARCH_MAX_AGE_MS).toISOString() },
    { price: 0 }, { price: Infinity }, { change_24h: NaN }, { volume_usd: NaN }, { s: "BTCUSD" },
  ])("rejects invalid or stale observation %j", change => {
    expect(eligibleResearchTicker({ ...ticker, ...change }, now)).toBe(false);
  });
  it("never creates losers from an all-positive market or duplicates candidates", () => {
    const items = [8, 5, 2].map((priceChange, i) => ({ symbol: String(i), priceChange }));
    expect(directionalMovers(items, 3)).toEqual(items);
    expect(directionalMovers(items.map(item => ({ ...item, priceChange: -item.priceChange })), 3)).toHaveLength(3);
  });
  it("sorts each direction and breaks ties deterministically", () => {
    expect(directionalMovers([
      { symbol: "B", priceChange: 5 }, { symbol: "A", priceChange: 5 },
      { symbol: "C", priceChange: -9 }, { symbol: "D", priceChange: -1 },
      { symbol: "E", priceChange: 0 }, { symbol: "F", priceChange: Infinity },
    ], 1).map(item => item.symbol)).toEqual(["A", "C"]);
  });
  it("retains a short-term reversal alongside a larger weekly move", () => {
    const daily = { symbol: "BTCUSDT", timeframe: "24h", priceChange: -5 };
    const weekly = { symbol: "BTCUSDT", timeframe: "7d", priceChange: 20 };
    expect(retainResearchHorizons([daily, weekly, daily])).toEqual([daily, weekly]);
  });
});
