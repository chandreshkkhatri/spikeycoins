import { describe, it, expect } from "vitest";
import { generateProcessScorecard } from "./process-score";
import { calculatePearsonCorrelation } from "./correlation";

describe("Process Scorecard Generator", () => {
  it("scores processScore: null for sessions with 0 trades", () => {
    const res = generateProcessScorecard({ trades: [] });
    expect(res.processScore).toBeNull();
  });

  it("scores 100 for perfectly disciplined trade execution", () => {
    const res = generateProcessScorecard({
      trades: [
        {
          entryCandle: 10,
          exitCandle: 20,
          side: "LONG",
          entryPrice: 100,
          exitPrice: 110,
          stopLoss: 95,
          takeProfit: 110,
          status: "TARGET_HIT",
          durationBars: 10,
          thesis: { setupType: "pullback-to-structure", classification: "day-trade" },
        },
      ],
    });

    expect(res.processScore).toBe(100);
    expect(res.components.INVALIDATION_RESPECTED.score).toBe(100);
  });

  it("deducts score when stop loss was widened", () => {
    const res = generateProcessScorecard({
      trades: [
        {
          entryCandle: 10,
          exitCandle: 20,
          side: "LONG",
          entryPrice: 100,
          exitPrice: 90,
          stopLoss: 90,
          takeProfit: 110,
          status: "STOPPED_OUT",
          stopHistory: [{ widened: true }],
          thesis: { setupType: "pullback-to-structure", classification: "day-trade" },
        },
      ],
    });

    expect(res.components.INVALIDATION_RESPECTED.score).toBe(0);
    expect(res.processScore).toBeLessThan(100);
  });
});

describe("Pearson Correlation Calculation", () => {
  it("returns null for n < 3 points", () => {
    const points = [
      { processScore: 80, pnlPct: 2 },
      { processScore: 90, pnlPct: 5 },
    ];
    expect(calculatePearsonCorrelation(points)).toBeNull();
  });

  it("calculates r = 1.0 for perfect positive correlation", () => {
    const points = [
      { processScore: 50, pnlPct: 1 },
      { processScore: 75, pnlPct: 3 },
      { processScore: 100, pnlPct: 5 },
    ];
    expect(calculatePearsonCorrelation(points)).toBe(1.0);
  });
});
