import { describe, it, expect } from "vitest";
import { calculatePositionSize, aggregateExposure } from "./sizing";

describe("Position Sizing Calculator", () => {
  it("calculates quantity rounding down so risk cap is never breached", () => {
    const res = calculatePositionSize({
      capital: 100000,
      riskPercent: 1, // $1,000 max risk
      entryPrice: 100,
      stopLoss: 97, // Risk per unit = $3
      qtyStep: 1,
    });

    expect(res.valid).toBe(true);
    expect(res.riskPerUnit).toBe(3);
    // 1000 / 3 = 333.333 -> floor = 333
    expect(res.quantity).toBe(333);
    // 333 * 3 = 999 <= 1000
    expect(res.quantity * res.riskPerUnit).toBeLessThanOrEqual(1000);
  });

  it("enforces ATR stop distance breathing room floor", () => {
    const res = calculatePositionSize({
      capital: 100000,
      riskPercent: 1,
      entryPrice: 100,
      stopLoss: 99.5, // Stop distance = 0.5
      atr: 1.0, // ATR = 1.0
      minStopAtrMultiple: 1.0, // Min stop distance = 1.0
    });

    expect(res.valid).toBe(false);
    expect(res.reason).toContain("below the required ATR floor");
  });

  it("rejects zero or negative stop distance", () => {
    const res = calculatePositionSize({
      capital: 100000,
      riskPercent: 1,
      entryPrice: 100,
      stopLoss: 100,
    });

    expect(res.valid).toBe(false);
    expect(res.reason).toBe("Stop loss cannot equal entry price");
  });

  it("aggregates active risk exposure across open and pending trades", () => {
    const trades = [
      { status: "OPEN", riskAmount: 1000 },
      { status: "PENDING", riskAmount: 500 },
      { status: "CLOSED", riskAmount: 1000 },
    ];

    expect(aggregateExposure(trades)).toBe(1500);
  });
});
