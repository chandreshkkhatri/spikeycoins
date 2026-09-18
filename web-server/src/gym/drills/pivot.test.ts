import { describe, it, expect } from "vitest";
import { gradePivotDrill } from "./pivot";
import { Pivot } from "../ta/types";

describe("drills/pivot", () => {
  const answerKey: Pivot[] = [
    { index: 10, price: 100, type: "BULLISH", symmetry: 1.0 },
    { index: 25, price: 120, type: "BEARISH", symmetry: 0.9 },
    { index: 40, price: 90, type: "BULLISH", symmetry: 0.8 },
  ];

  it("grades perfect pivot marks with F1 = 1.0", () => {
    const userMarks = [10, 25, 40];
    const grade = gradePivotDrill(answerKey, userMarks, 1);

    expect(grade.truePositives).toBe(3);
    expect(grade.falsePositives).toBe(0);
    expect(grade.falseNegatives).toBe(0);
    expect(grade.f1Score).toBe(1.0);
  });

  it("accepts user marks within +/- 1 bar tolerance", () => {
    const userMarks = [11, 24, 41]; // all offset by 1
    const grade = gradePivotDrill(answerKey, userMarks, 1);

    expect(grade.truePositives).toBe(3);
    expect(grade.f1Score).toBe(1.0);
  });
});
