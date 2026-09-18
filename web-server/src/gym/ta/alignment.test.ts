import { describe, it, expect } from "vitest";
import { evaluateAlignment } from "./alignment";
import { ICandle } from "../session/candles";

function makeTrendCandles(type: "BULLISH" | "BEARISH" | "CONSOLIDATING"): ICandle[] {
  return Array.from({ length: 60 }, (_, i) => {
    let price = 100;
    if (type === "BULLISH") price = 100 + i * 2;
    else if (type === "BEARISH") price = 200 - i * 2;
    else price = 100;

    return {
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 10,
      timestamp: i,
    };
  });
}

describe("Multi-Timeframe Alignment Matrix", () => {
  it("enforces FULL_ALIGNMENT_NO_TRADE when all 3 timeframes are impulsing in same direction", () => {
    const htf = makeTrendCandles("BULLISH");
    const main = makeTrendCandles("BULLISH");
    const ltf = makeTrendCandles("BULLISH");

    const res = evaluateAlignment(htf, main, ltf);
    expect(res.tradable).toBe(false);
    expect(res.code).toBe("FULL_ALIGNMENT_NO_TRADE");
    expect(res.verdict.toLowerCase()).toContain("all timeframes are impulsing together");
  });

  it("identifies tradable HTF_IMPULSE_LTF_CONSOLIDATION when HTF impulses and LTF consolidates", () => {
    const htf = makeTrendCandles("BULLISH");
    const main = makeTrendCandles("BULLISH");
    const ltf = makeTrendCandles("CONSOLIDATING");

    const res = evaluateAlignment(htf, main, ltf);
    expect(res.tradable).toBe(true);
    expect(res.code).toBe("HTF_IMPULSE_LTF_CONSOLIDATION");
  });

  it("rejects chop when HTF is consolidating", () => {
    const htf = makeTrendCandles("CONSOLIDATING");
    const main = makeTrendCandles("BULLISH");
    const ltf = makeTrendCandles("BULLISH");

    const res = evaluateAlignment(htf, main, ltf);
    expect(res.tradable).toBe(false);
    expect(res.code).toBe("CHOP_NO_TRADE");
  });
});
