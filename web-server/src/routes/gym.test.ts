import { describe, expect, it, vi } from "vitest";
import { RequestHandler, Response } from "express";
import GymSession, { IGymSession } from "../models/gym-session";
import router, { GymRequest } from "./gym";
import { formatSessionResponse, IScorecardResult, IThesisValidationResult } from "../gym";

interface RouteLayer {
  route?: { path: string; stack: Array<{ handle: RequestHandler }> };
}
interface Result {
  status: number;
  body: {
    session?: ReturnType<typeof formatSessionResponse>;
    scorecard?: IScorecardResult;
    validation?: IThesisValidationResult;
    code?: string;
  };
}

// Exercise the actual endpoint handlers against real Mongoose documents, with
// ownership already established and only persistence stubbed (no external DB).
function invoke(path: string, session: IGymSession, body: object = {}): Promise<Result> {
  const layers = router.stack as RouteLayer[];
  const route = layers.find((layer) => layer.route?.path === path)?.route;
  if (!route) throw new Error(`Missing route ${path}`);
  const handler = route.stack[route.stack.length - 1].handle;
  return new Promise((resolve, reject) => {
    let status = 200;
    const response = {
      status(code: number) { status = code; return response; },
      json(payload: Result["body"]) { resolve({ status, body: payload }); return response; },
    };
    handler({ gymSession: session, body } as GymRequest, response as Response, reject);
  });
}

function fixture() {
  const candle = { open: 100, high: 102, low: 98, close: 100, volume: 1, timestamp: 0 };
  const session = new GymSession({
    userId: "test-user", schemaVersion: 2, mode: "METHOD", actualSymbol: "BTCUSDT",
    actualStartTimestamp: 0, interval: "15m", priceMultiplier: 1,
    startingCapital: 100000, capital: 100000, currentCandleIndex: 50,
    candles: Array.from({ length: 51 }, (_, timestamp) => ({ ...candle, timestamp })),
    warmupCandles: Array.from({ length: 20 }, (_, timestamp) => ({ ...candle, timestamp })),
    trades: [], totalPnl: 0, status: "ACTIVE",
  });
  vi.spyOn(session, "save").mockResolvedValue(session);
  return session;
}

const thesis = {
  setupType: "pullback-to-structure", side: "LONG", triggerPrice: 100,
  invalidationPrice: 95, plannedStop: 94, targetPrice: 110,
  classification: "day-trade", plannedRiskPercent: 1,
};

async function place(session: IGymSession) {
  return invoke("/session/:id/trade", session, { side: "LONG", stopLoss: 94, takeProfit: 110, thesis });
}

describe("Gym methodology API integration", () => {
  it("enforces ATR in preview and placement without reading future candles", async () => {
    const session = fixture();
    session.candles[50].high = 10000;
    const tight = { ...thesis, invalidationPrice: 99, plannedStop: 99 };
    const preview = await invoke("/session/:id/thesis/preview", session, tight);
    expect(preview.body.validation?.valid).toBe(false);
    expect(preview.body.validation?.autoChecks.find((check) => check.id === "BREATHING_ROOM")?.passed).toBe(false);
    const rejected = await invoke("/session/:id/trade", session, {
      side: "LONG", stopLoss: 99, takeProfit: 110, thesis: tight,
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("THESIS_INVALID");
    expect((await place(session)).status).toBe(200);
    expect(session.trades[0].initialStopLoss).toBe(94);
  });

  it("returns live score previews without persisting, then includes final scores on reveal", async () => {
    const session = fixture();
    expect((await invoke("/session/:id/scorecard", session)).body.scorecard?.processScore).toBeNull();
    expect(session.save).not.toHaveBeenCalled();
    await place(session);
    await invoke("/session/:id/close", session);
    expect((await invoke("/session/:id/scorecard", session)).body.scorecard?.processScore).toBe(100);
    expect(session.scorecard?.evaluatedAt).toBeUndefined();
    const revealed = await invoke("/session/:id/reveal", session);
    expect(revealed.body.session?.scorecard?.processScore).toBe(100);
    expect(session.scorecard?.evaluatedAt).toBeInstanceOf(Date);
    const savedAt = session.scorecard?.evaluatedAt;
    vi.mocked(session.save).mockClear();
    expect((await invoke("/session/:id/scorecard", session)).body.scorecard?.evaluatedAt).toEqual(savedAt);
    expect(session.save).not.toHaveBeenCalled();
  });

  it("overwrites premature snapshots and scores natural completion after settling trades", async () => {
    const session = fixture();
    await place(session);
    session.scorecard = { version: "1.0.0", processScore: null, components: {}, methodologyVersion: "1.0.0", evaluatedAt: new Date(0) };
    const result = await invoke("/session/:id/wait", session);
    expect(result.body.session?.status).toBe("COMPLETED");
    expect(result.body.session?.trades[0].status).toBe("CLOSED");
    expect(result.body.session?.scorecard?.processScore).toBe(100);
  });

  it.each(["/session/:id/close", "/session/:id/reveal"])("preserves initial risk through modification and %s", async (path) => {
    const session = fixture();
    await place(session);
    await invoke("/session/:id/modify-stop", session, { tradeIndex: 0, newStop: 88 });
    session.candles[49].close = 88;
    await invoke(path, session);
    expect(session.trades[0].rMultiple).toBe(-2);
    expect(session.totalR).toBe(-2);
  });

  it("generates a scorecard when abandoning a session with closed trades", async () => {
    const session = fixture();
    await place(session);
    await invoke("/session/:id/close", session);
    const result = await invoke("/session/:id/abandon", session);
    expect(result.body.session?.scorecard?.processScore).toBe(100);
  });
});
