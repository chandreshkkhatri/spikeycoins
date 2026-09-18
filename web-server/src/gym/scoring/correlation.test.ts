import { describe, it, expect } from "vitest";
import { calculatePearsonCorrelation } from "./correlation";

describe("scoring/correlation", () => {
  it("returns null when dataset has fewer than 3 points", () => {
    expect(
      calculatePearsonCorrelation([
        { processScore: 80, pnlPct: 5 },
        { processScore: 90, pnlPct: 10 },
      ])
    ).toBeNull();
  });

  it("returns 1 for perfect positive correlation", () => {
    const data = [
      { processScore: 50, pnlPct: 5 },
      { processScore: 70, pnlPct: 10 },
      { processScore: 90, pnlPct: 15 },
    ];
    const corr = calculatePearsonCorrelation(data);
    expect(corr).toBeCloseTo(1.0, 4);
  });

  it("returns null for zero variance (flat values)", () => {
    const data = [
      { processScore: 80, pnlPct: 5 },
      { processScore: 80, pnlPct: 5 },
      { processScore: 80, pnlPct: 5 },
    ];
    expect(calculatePearsonCorrelation(data)).toBeNull();
  });
});
