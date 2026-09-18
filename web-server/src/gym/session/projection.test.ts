import { describe, it, expect } from "vitest";
import { formatSessionResponse } from "./projection";

describe("Gym Projection", () => {
  it("never leaks main candles beyond currentCandleIndex", () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 101 + i,
      volume: 10,
      timestamp: i,
    }));

    const session = {
      id: "test-session-id",
      interval: "15m",
      currentCandleIndex: 50,
      candles,
      trades: [],
      totalPnl: 0,
      status: "ACTIVE",
    };

    const projection = formatSessionResponse(session);
    expect(projection.candles.length).toBe(50);
    expect(projection.totalCandles).toBe(100);
    expect(projection.candles[49].timestamp).toBe(49);
  });

  it("aggregates forming HTF bar without leaking future HTF candles", () => {
    // 15m interval with 1h higher interval -> multiplier is 4
    const candles = Array.from({ length: 10 }, (_, i) => ({
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 101 + i,
      volume: 10,
      timestamp: i,
    }));

    const higherCandles = [
      { open: 100, high: 110, low: 90, close: 105, volume: 40, timestamp: 0 },
      { open: 104, high: 114, low: 94, close: 109, volume: 40, timestamp: 1 },
      { open: 108, high: 118, low: 98, close: 113, volume: 40, timestamp: 2 },
    ];

    // currentCandleIndex = 6 -> 4 completed candles in HTF bar 0, 2 remaining in bar 1
    const session = {
      id: "test-session-id",
      interval: "15m",
      currentCandleIndex: 6,
      candles,
      higherInterval: "1h",
      higherCandles,
      trades: [],
      totalPnl: 0,
      status: "ACTIVE",
    };

    const projection = formatSessionResponse(session);
    // completed index = floor(6/4) = 1. Base higher candles = 1 candle.
    // remainderStart = 4. mainSlice = candles[4..5].
    // forming HTF bar appended => total 2 higher candles projected!
    expect(projection.higherCandles?.length).toBe(2);
    expect(projection.higherCandles?.[0]).toEqual(higherCandles[0]);
    // Forming bar:
    const forming = projection.higherCandles?.[1];
    expect(forming?.open).toBe(candles[4].open);
    expect(forming?.close).toBe(candles[5].close);
    expect(forming?.volume).toBe(20);
  });
});
