import { describe, it, expect } from "vitest";
import { ema, rsi, atr } from "./series";
import { ICandle } from "../session/candles";

describe("Indicator Series Math", () => {
  it("preserves seed equivalence across sliced EMA series", () => {
    const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i) * 10);
    const fullEma = ema(prices, 20);

    const splitIndex = 50;
    const seed = fullEma[splitIndex - 1];
    const tailPrices = prices.slice(splitIndex);
    const tailEma = ema(tailPrices, 20, seed);

    expect(tailEma[0]).toBeCloseTo(fullEma[splitIndex], 3);
    expect(tailEma[10]).toBeCloseTo(fullEma[splitIndex + 10], 3);
  });

  it("proves scale invariance for RSI when prices are multiplied by 7.3", () => {
    const candles: ICandle[] = Array.from({ length: 50 }, (_, i) => ({
      open: 100 + Math.sin(i) * 5,
      high: 105 + Math.sin(i) * 5,
      low: 95 + Math.sin(i) * 5,
      close: 101 + Math.cos(i) * 5,
      volume: 100,
      timestamp: i,
    }));

    const scaledCandles: ICandle[] = candles.map((c) => ({
      ...c,
      open: c.open * 7.3,
      high: c.high * 7.3,
      low: c.low * 7.3,
      close: c.close * 7.3,
    }));

    const rsiOriginal = rsi(candles, 14);
    const rsiScaled = rsi(scaledCandles, 14);

    expect(rsiOriginal).toEqual(rsiScaled);
  });
});
