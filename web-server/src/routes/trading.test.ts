import { describe, expect, it, vi } from "vitest";
import type { RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../lib/auth-middleware";
import router from "./trading";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock("../lib/broker-factory", () => ({
  BrokerFactory: { getBinanceClient: () => ({
    getFuturesAccount: mocks.account,
    getFuturesPositions: async () => [],
    getFuturesOpenOrders: async () => [],
    getFuturesOpenAlgoOrders: async () => [],
    getFuturesExchangeInfo: mocks.exchange,
    getFuturesLeverageBrackets: async () => [{ symbol: "BTCUSDT", brackets: [{ initialLeverage: 20 }] }],
  }) },
}));

interface Summary {
  success: boolean;
  asOf: number;
  accountDetails: { availableBalance: number };
  symbolInfo: { verified: boolean; maxLeverage?: number } | null;
}
let sequence = 0;
function invoke(accountId: string): Promise<Summary> {
  const layer = (router.stack as Array<{ route?: { path: string; stack: Array<{ handle: RequestHandler }> } }>)
    .find(item => item.route?.path === "/summary")!.route!;
  const handler = layer.stack.at(-1)!.handle;
  return new Promise((resolve, reject) => {
    const response = {
      set() { return response; },
      json(value: Summary) { resolve(value); return response; },
    };
    handler({
      query: { symbol: "BTCUSDT" },
      account: { _id: accountId, accountType: "binance", metadata: { tradingSegment: "usdm" } },
    } as unknown as AuthenticatedRequest, response as unknown as Response, reject);
  });
}
describe("trading summary readiness", () => {
  it("awaits cache hits and preserves zero balance and original source time", async () => {
    mocks.account.mockResolvedValue({
      totalMaintMargin: "10", totalMarginBalance: "1000", availableBalance: "0", totalUnrealizedProfit: "0",
    });
    mocks.exchange.mockResolvedValue({ symbols: [{
      symbol: "BTCUSDT", filters: [
        { filterType: "PRICE_FILTER", tickSize: "0.01" },
        { filterType: "LOT_SIZE", stepSize: "0.001", minQty: "0.001" },
        { filterType: "MIN_NOTIONAL", notional: "5" },
      ],
    }] });
    const accountId = "summary-" + ++sequence;
    const first = await invoke(accountId);
    const cached = await invoke(accountId);
    expect(cached.success).toBe(true);
    expect(cached.asOf).toBe(first.asOf);
    expect(cached.accountDetails.availableBalance).toBe(0);
    expect(cached.symbolInfo?.verified).toBe(true);
    expect(cached.symbolInfo?.maxLeverage).toBe(20);
  });

  it("does not verify rules filled with fallback defaults", async () => {
    mocks.exchange.mockResolvedValue({ symbols: [{ symbol: "BTCUSDT", filters: [] }] });
    const result = await invoke("summary-" + ++sequence);
    expect(result.symbolInfo?.verified).toBe(false);
  });
});
