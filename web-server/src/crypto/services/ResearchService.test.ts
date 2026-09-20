import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchService from "./ResearchService";
import { evaluatePublication, PUBLICATION_POLICY_VERSION, type ResearchEvidence } from "./researchPublication";

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(), create: vi.fn(), update: vi.fn(),
  summaryCreate: vi.fn(), retract: vi.fn(), aggregate: vi.fn(),
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
  default: { getTickerBySymbol: () => ({ price: 10, change_24h: 30, volume_usd: 1000000 }) },
}));
vi.mock("./MarketCapService", () => ({ default: { getMarketCapData: () => null } }));
vi.mock("./DailyCandlestickService", () => ({ default: {} }));
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
    }));
    expect(mocks.summaryCreate).toHaveBeenCalledTimes(1);
  });
  it("retracts a rejected automated revision even if semantic comparison would say unchanged", async () => {
    vi.useFakeTimers();
    const service = ResearchService.getInstance();
    const harness = service as unknown as Harness;
    vi.spyOn(harness, "getTopMovers").mockImplementation(async period => period === "24h" ? [{
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
      $set: expect.objectContaining({ isPublishable: false }),
    }));
    expect(mocks.retract).toHaveBeenCalledWith({ researchId: "old" }, expect.objectContaining({
      $set: expect.objectContaining({ isPublished: false }),
    }));
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
