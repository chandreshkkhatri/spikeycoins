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
        { status: "STOPPED_OUT", pnl: -1, pnlCash: -1000 },
        { status: "STOPPED_OUT", pnl: -1, pnlCash: -1000 },
        { status: "STOPPED_OUT", pnl: -1, pnlCash: -1000 },
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
        { status: "TARGET_HIT", pnl: 4.0, pnlCash: 4000 },
        { status: "STOPPED_OUT", pnl: -1.5, pnlCash: -1500 }, // Dropped from 4.0% to 2.5% -> giveback = 1.5/4.0 = 37.5% > 25%
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
      trades: [{ status: "TARGET_HIT", pnl: 2.5, pnlCash: 2500 }],
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

describe("Governor account returns and structural stops", () => {
  it("does not promote based on instrument returns or a stale price-return peak", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 50, totalPnl: 2, startingCapital: 100000,
      trades: [{ status: "CLOSED", pnl: 2, pnlCash: 200 }],
      governor: { riskTier: "FULL", peakBufferPct: 2, consecutiveLosses: 0, isHalted: false, haltReason: null },
    };
    expect(evaluateGovernor(state).riskTier).toBe("WARMUP");
    expect(state.governor?.peakBufferPct).toBe(0.2);
  });

  it("recovers the account equity peak from closed trades without prior evaluations", () => {
    const state: IGovernorSessionState = {
      currentCandleIndex: 50, totalPnl: 1, startingCapital: 100000,
      trades: [{ status: "CLOSED", pnl: 2, pnlCash: 4000 }, { status: "CLOSED", pnl: -1, pnlCash: -1500 }],
    };
    expect(evaluateGovernor(state).ruleId).toBe("PEAK_BUFFER_GIVEBACK_EXCEEDED");
    expect(state.governor?.peakBufferPct).toBe(4);
  });

  it.each([
    { side: "LONG" as const, plannedStop: 94, invalidationPrice: 95, targetPrice: 110 },
    { side: "SHORT" as const, plannedStop: 106, invalidationPrice: 105, targetPrice: 90 },
  ])("accepts a $side stop beyond structural invalidation", (prices) => {
    const result = validateThesis({ ...prices, triggerPrice: 100, setupType: "pullback-to-structure" },
      { currentCandleIndex: 50, totalPnl: 0, trades: [] }, 100, 2);
    expect(result.valid).toBe(true);
  });
});
