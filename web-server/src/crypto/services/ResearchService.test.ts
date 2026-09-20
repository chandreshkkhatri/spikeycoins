import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchService from "./ResearchService";
import { snapshot24h } from './researchInputSnapshot';
import { evaluatePublication, PUBLICATION_POLICY_VERSION, type ResearchEvidence } from "./researchPublication";

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(), create: vi.fn(), update: vi.fn(),
  summaryCreate: vi.fn(), retract: vi.fn(), aggregate: vi.fn(),
  tickers: vi.fn(), weekly: vi.fn(),
}));
vi.mock("../utils/aiClient", () => ({ default: class { generateWithEvidence = mocks.evidence; } }));
vi.mock("../models/Research", () => ({
  ResearchModel: { create: mocks.create, findByIdAndUpdate: mocks.update, collection: { name: "researches" } },
}));
vi.mock("../models/Summary", () => ({
  SummaryModel: { create: mocks.summaryCreate, updateMany: mocks.retract, aggregate: mocks.aggregate },
}));
vi.mock("./DatabaseConnection", () => ({ default: { isConnectionReady: () => true } }));
vi.mock("../core/DataManager", () => ({
  default: { getAllTickers: mocks.tickers, getTickerBySymbol: () => ({
    s: "BTCUSDT", price: 10, change_24h: 30, volume_usd: 1000000,
    last_updated: new Date().toISOString(), is_futures: false,
  }) },
}));
vi.mock("./MarketCapService", () => ({ default: { getMarketCapData: () => null } }));
vi.mock("./DailyCandlestickService", () => ({
  default: { getInstance: () => ({ calculate7dChanges: mocks.weekly }) },
}));
vi.mock("../utils/logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function evidence(publish = true): ResearchEvidence {
  const headline = "Protocol upgrade announced";
  const researchContent = "The project announced an upgrade.";
  return {
    text: JSON.stringify({
      headline, researchContent, sources: [], isPublishable: publish,
      publishableReason: publish ? "Announcement" : "No verified catalyst",
      category: "Technical Upgrade", impact: "low",
    }),
    model: "fixture", finishReason: "STOP",
    grounding: {
      groundingChunks: [{ web: { uri: "https://project.example/upgrade" } }],
      groundingSupports: [headline, researchContent].map(text => ({ segment: { text }, groundingChunkIndices: [0] })),
    },
  };
}
type Harness = {
  getTopMovers: (period: string) => Promise<unknown[]>;
  findRecentResearch: (symbol: string, timeframe: string, hours: number) => Promise<unknown>;
  hasSignificantEvent: () => Promise<{ hasEvent: boolean; reason: string }>;
  hasSignificantNewInfo: () => Promise<{ hasNewInfo: boolean; reason: string }>;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.evidence.mockResolvedValue(evidence());
  mocks.create.mockResolvedValue({ _id: "research-id" });
  mocks.update.mockResolvedValue({});
  mocks.summaryCreate.mockResolvedValue({});
  mocks.retract.mockResolvedValue({});
  mocks.aggregate.mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("research publication paths", () => {
  it("filters stale observations before ranking and keeps only Spot-backed weekly candidates", async () => {
    const fresh = {
      s: "BTCUSDT", price: 10, change_24h: 2, volume_usd: 1000000,
      last_updated: new Date().toISOString(), is_futures: false,
    };
    mocks.tickers.mockReturnValue([
      fresh,
      { ...fresh, s: "OLDUSDT", change_24h: 99, last_updated: "2000-01-01T00:00:00Z" },
      { ...fresh, s: "PERPUSDT", is_futures: true },
    ]);
    mocks.weekly.mockResolvedValue([
      { symbol: "BTC", price: "10", change_7d: 5, volume: '9000', referencePrice: 10 / 1.05,
        referenceTime: '2026-09-13T00:00:00Z', observedAt: fresh.last_updated },
      { symbol: "OLD", price: "10", change_7d: 99 },
      { symbol: "PERP", price: "10", change_7d: 50 },
    ]);
    const harness = ResearchService.getInstance() as unknown as Harness;
    expect(await harness.getTopMovers("24h")).toEqual([
      expect.objectContaining({ symbol: "BTCUSDT" }),
      expect.objectContaining({ symbol: "PERPUSDT" }),
    ]);
    expect(await harness.getTopMovers("7d")).toEqual([
      expect.objectContaining({ symbol: "BTCUSDT", timeframe: "7d", priceChange: 5,
        inputSnapshot: expect.objectContaining({ quoteTurnover: 9000, referencePrice: 10 / 1.05,
          observedAt: fresh.last_updated, referenceTime: '2026-09-13T00:00:00Z' }) }),
    ]);
  });
  it("keeps manual negative research private even when grounding exists", async () => {
    mocks.evidence.mockResolvedValue(evidence(false));
    const result = await ResearchService.getInstance().researchSingleCoin("BTCUSDT");
    expect(result.success).toBe(true);
    expect(result.summary.publicationStatus).toBe("draft");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ isPublishable: false }));
    expect(mocks.summaryCreate).not.toHaveBeenCalled();
  });
  it("keeps ungrounded manual research private even if the model asks to publish", async () => {
    mocks.evidence.mockResolvedValue({ ...evidence(), grounding: null });
    const result = await ResearchService.getInstance().researchSingleCoin("BTCUSDT");
    expect(result.summary.publicationStatus).toBe("draft");
    expect(mocks.summaryCreate).not.toHaveBeenCalled();
  });
  it("publishes supported manual research and persists its evidence", async () => {
    const result = await ResearchService.getInstance().researchSingleCoin("BTCUSDT");
    expect(result.summary.publicationStatus).toBe("published");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      isPublishable: true, publicationPolicyVersion: PUBLICATION_POLICY_VERSION,
      evidence: expect.objectContaining({ model: "fixture" }),
      inputSnapshot: expect.objectContaining({ symbol: 'BTCUSDT', price: 10, priceChange: 30,
        venue: 'binance-spot', windowMethod: 'exchange-24h-ticker', referencePrice: null }),
    }));
    const saved = mocks.create.mock.calls[0][0];
    expect(saved.inputSnapshotHistory).toEqual([saved.inputSnapshot]);
    expect(mocks.summaryCreate).toHaveBeenCalledTimes(1);
  });
  it("retracts a rejected automated revision even if semantic comparison would say unchanged", async () => {
    vi.useFakeTimers();
    const service = ResearchService.getInstance();
    const harness = service as unknown as Harness;
    vi.spyOn(harness, "getTopMovers").mockImplementation(async period => period === "24h" ? [{
      inputSnapshot: snapshot24h({ s: 'BTCUSDT', price: 10, change_24h: 30, volume_usd: 1000000,
        last_updated: new Date().toISOString(), is_futures: false }),
      symbol: "BTC", name: "Bitcoin", priceChange: 30, price: 10, volume: 1000000, timeframe: "24h",
    }] : []);
    vi.spyOn(harness, "findRecentResearch").mockImplementation(async (_s, _t, hours) =>
      hours === 2 ? null : { _id: "old", priceChange: 1, researchedAt: new Date(Date.now() - 3 * 3600000) });
    vi.spyOn(harness, "hasSignificantEvent").mockResolvedValue({ hasEvent: true, reason: "Event" });
    const compare = vi.spyOn(harness, "hasSignificantNewInfo").mockResolvedValue({ hasNewInfo: false, reason: "Same" });
    mocks.evidence.mockResolvedValue(evidence(false));
    const run = service.runAutomatedResearch();
    await vi.runAllTimersAsync();
    await run;
    expect(compare).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith("old", expect.objectContaining({
      $set: expect.objectContaining({ isPublishable: false, inputSnapshot: expect.objectContaining({ priceChange: 30 }) }),
      $push: { inputSnapshotHistory: expect.objectContaining({ priceChange: 30 }) },
    }), { runValidators: true });
    const update = mocks.update.mock.calls.find(call => call[1].$push)![1];
    expect(update.$set.inputSnapshot).toEqual(update.$push.inputSnapshotHistory);
    expect(update.$set.inputSnapshotHistory).toBeUndefined();
    expect(mocks.retract).toHaveBeenCalledWith({ researchId: "old" }, expect.objectContaining({
      $set: expect.objectContaining({ isPublished: false }),
    }));
  });
  it("leaves the published input snapshot alone when new research is not adopted", async () => {
    vi.useFakeTimers();
    const service = ResearchService.getInstance();
    const harness = service as unknown as Harness;
    vi.spyOn(harness, 'getTopMovers').mockImplementation(async period => period === '24h' ? [{
      symbol: 'BTCUSDT', name: 'Bitcoin', priceChange: 30, price: 10, volume: 1000000, timeframe: '24h',
      inputSnapshot: snapshot24h({ s: 'BTCUSDT', price: 10, change_24h: 30, volume_usd: 1000000,
        last_updated: new Date().toISOString(), is_futures: false }),
    }] : []);
    vi.spyOn(harness, 'findRecentResearch').mockImplementation(async (_s, _t, hours) =>
      hours === 2 ? null : { _id: 'old', priceChange: 1, isPublishable: true,
        publicationPolicyVersion: PUBLICATION_POLICY_VERSION,
        researchedAt: new Date(Date.now() - 3 * 3600000) });
    vi.spyOn(harness, 'hasSignificantEvent').mockResolvedValue({ hasEvent: true, reason: 'Event' });
    vi.spyOn(harness, 'hasSignificantNewInfo').mockResolvedValue({ hasNewInfo: false, reason: 'Same' });
    const run = service.runAutomatedResearch();
    await vi.runAllTimersAsync();
    await run;
    expect(mocks.evidence).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith('old', { $set: { updatedAt: expect.any(Date) } });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("filters legacy/rejected stories and uses gated evidence rather than stale summary text", async () => {
    const valid = { ...evaluatePublication(evidence()), evidence: evidence(), publicationPolicyVersion: 1, coinSymbol: "BTC" };
    mocks.aggregate.mockResolvedValue([
      { _id: "ok", research: valid, title: "Stale headline" },
      { _id: "legacy", research: { ...valid, publicationPolicyVersion: undefined } },
      { _id: "retracted", research: { ...valid, isPublishable: false } },
      { _id: "bad", research: { ...valid, evidence: { ...evidence(), grounding: null } } },
    ]);
    const results = await ResearchService.getInstance().getLatestSummaries(10);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Protocol upgrade announced");
    const pipeline = mocks.aggregate.mock.calls[0][0];
    expect(pipeline).toContainEqual({ $match: {
      "research.isPublishable": true, "research.publicationPolicyVersion": 1,
    } });
    expect(pipeline.findIndex((stage: object) => "$match" in stage)).toBeLessThan(
      pipeline.findIndex((stage: object) => "$limit" in stage));
  });
});
