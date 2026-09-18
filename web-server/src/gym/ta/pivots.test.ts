import { describe, it, expect } from "vitest";
import { findPivots, gradePivotDrill, IPivot } from "./pivots";
import { ICandle } from "../session/candles";

describe("Pivot Detection & Drill Grading", () => {
  it("detects degree-1 bullish and bearish hinges in synthetic zigzag", () => {
    // Index 1 is high (bearish pivot), Index 3 is low (bullish pivot)
    const candles: ICandle[] = [
      { open: 100, high: 102, low: 98, close: 100, volume: 10, timestamp: 0 },
      { open: 100, high: 120, low: 99, close: 115, volume: 10, timestamp: 1 }, // Bearish pivot
      { open: 115, high: 116, low: 90, close: 92, volume: 10, timestamp: 2 },
      { open: 92, high: 93, low: 80, close: 85, volume: 10, timestamp: 3 }, // Bullish pivot
      { open: 85, high: 105, low: 84, close: 100, volume: 10, timestamp: 4 },
    ];

    const pivots = findPivots(candles);
    expect(pivots.length).toBe(2);
    expect(pivots[0].index).toBe(1);
    expect(pivots[0].type).toBe("BEARISH");

    expect(pivots[1].index).toBe(3);
    expect(pivots[1].type).toBe("BULLISH");
  });

  it("never detects index 0 or index length-1 as pivots", () => {
    const candles: ICandle[] = [
      { open: 100, high: 200, low: 50, close: 100, volume: 10, timestamp: 0 },
      { open: 100, high: 110, low: 90, close: 100, volume: 10, timestamp: 1 },
      { open: 100, high: 200, low: 50, close: 100, volume: 10, timestamp: 2 },
    ];

    const pivots = findPivots(candles);
    expect(pivots.every((p) => p.index !== 0 && p.index !== 2)).toBe(true);
  });

  it("grades pivot drill correctly with ±1 bar tolerance", () => {
    const answerKey: IPivot[] = [
      { index: 10, price: 100, type: "BULLISH", symmetry: 1.0 },
      { index: 25, price: 150, type: "BEARISH", symmetry: 1.0 },
    ];

    // User marks index 11 (1 bar off from 10) and index 25 (exact match) + 1 false positive at index 40
    const userMarks = [11, 25, 40];

    const grade = gradePivotDrill(answerKey, userMarks, 1);
    expect(grade.tp).toBe(2);
    expect(grade.fp).toBe(1);
    expect(grade.fn).toBe(0);
    expect(grade.precision).toBe(66.7);
    expect(grade.recall).toBe(100);
    expect(grade.f1Score).toBe(80);
  });
});
