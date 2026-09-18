import { describe, it, expect } from "vitest";
import { evaluateGovernor, validateThesis, IGovernorSessionState } from "./governor";

describe("Mechanical Risk Governor", () => {
  it("starts in WARMUP tier with 0 consecutive losses", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 10,
      totalPnl: 0,
      trades: [],
    };

    const res = evaluateGovernor(state);
    expect(res.allowed).toBe(true);
    expect(res.riskTier).toBe("WARMUP");
    expect(res.isHalted).toBe(false);
  });

  it("halts session after 3 consecutive losses", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 30,
      totalPnl: -3,
      trades: [
        { status: "STOPPED_OUT", pnl: -1 },
        { status: "STOPPED_OUT", pnl: -1 },
        { status: "STOPPED_OUT", pnl: -1 },
      ],
    };

    const res = evaluateGovernor(state);
    expect(res.allowed).toBe(false);
    expect(res.isHalted).toBe(true);
    expect(res.ruleId).toBe("CONSECUTIVE_LOSSES_EXCEEDED");
  });

  it("halts session when giving back 25% of peak buffer", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 50,
      totalPnl: 2.5,
      governor: {
        riskTier: "FULL",
        consecutiveLosses: 1,
        peakBufferPct: 4.0, // Peak buffer was +4.0%
        isHalted: false,
        haltReason: null,
      },
      trades: [
        { status: "TARGET_HIT", pnl: 4.0 },
        { status: "STOPPED_OUT", pnl: -1.5 }, // Dropped from 4.0% to 2.5% -> giveback = 1.5/4.0 = 37.5% > 25%
      ],
    };

    const res = evaluateGovernor(state);
    expect(res.allowed).toBe(false);
    expect(res.isHalted).toBe(true);
    expect(res.ruleId).toBe("PEAK_BUFFER_GIVEBACK_EXCEEDED");
  });

  it("promotes to FULL tier when positive buffer >= 2.0%", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 20,
      totalPnl: 2.5,
      trades: [{ status: "TARGET_HIT", pnl: 2.5 }],
    };

    const res = evaluateGovernor(state);
    expect(res.allowed).toBe(true);
    expect(res.riskTier).toBe("FULL");
  });
});

describe("Thesis Validation Engine", () => {
  it("validates valid LONG thesis with correct price ordering and ATR breathing room", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 10,
      startingCapital: 100000,
      totalPnl: 0,
      trades: [],
    };

    const res = validateThesis(
      {
        setupType: "pullback-to-structure",
        side: "LONG",
        triggerPrice: 100,
        plannedStop: 95,
        invalidationPrice: 95,
        targetPrice: 110,
        classification: "day-trade",
        plannedRiskPercent: 1.0,
      },
      state,
      100,
      2.0 // ATR = 2.0 -> min stop distance = 2.0. Planned distance = 5.0 (passed)
    );

    expect(res.valid).toBe(true);
    expect(res.calculatedQuantity).toBe(100); // $500 WARMUP risk / $5 = 100 units
    expect(res.autoChecks.every((c) => c.passed)).toBe(true);
  });

  it("rejects thesis when price ordering is invalid for LONG", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 10,
      startingCapital: 100000,
      totalPnl: 0,
      trades: [],
    };

    const res = validateThesis(
      {
        setupType: "pullback-to-structure",
        side: "LONG",
        triggerPrice: 100,
        plannedStop: 105, // Stop ABOVE trigger for LONG (invalid)
        invalidationPrice: 95,
        targetPrice: 110,
      },
      state,
      100,
      1.0
    );

    expect(res.valid).toBe(false);
    expect(res.reason).toContain("LONG requirement");
  });
});
