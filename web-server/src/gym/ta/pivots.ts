import { ICandle } from "../session/candles";

export interface IPivot {
  index: number;
  price: number;
  type: "BULLISH" | "BEARISH";
  symmetry: number;
}

/**
 * Calculate pivot symmetry (0..1) based on surrounding swing heights.
 */
export function calculatePivotSymmetry(
  candles: ICandle[],
  index: number,
  type: "BULLISH" | "BEARISH"
): number {
  if (index <= 0 || index >= candles.length - 1) return 0;

  const leftDepth =
    type === "BULLISH"
      ? Math.abs(candles[index - 1].low - candles[index].low)
      : Math.abs(candles[index].high - candles[index - 1].high);

  const rightDepth =
    type === "BULLISH"
      ? Math.abs(candles[index + 1].low - candles[index].low)
      : Math.abs(candles[index].high - candles[index + 1].high);

  const maxD = Math.max(leftDepth, rightDepth);
  const minD = Math.min(leftDepth, rightDepth);

  return maxD > 0 ? +(minD / maxD).toFixed(2) : 1.0;
}

/**
 * Find degree-1 structural pivots.
 * First and last candles are excluded.
 */
export function findPivots(candles: ICandle[]): IPivot[] {
  const pivots: IPivot[] = [];
  if (candles.length < 3) return pivots;

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Degree-1 Bullish Hinge Pivot
    if (curr.low < prev.low && curr.low < next.low) {
      const symmetry = calculatePivotSymmetry(candles, i, "BULLISH");
      pivots.push({
        index: i,
        price: curr.low,
        type: "BULLISH",
        symmetry,
      });
    }

    // Degree-1 Bearish Hinge Pivot
    if (curr.high > prev.high && curr.high > next.high) {
      const symmetry = calculatePivotSymmetry(candles, i, "BEARISH");
      pivots.push({
        index: i,
        price: curr.high,
        type: "BEARISH",
        symmetry,
      });
    }
  }

  return pivots;
}

export interface IPivotGradeResult {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1Score: number;
  detail: Array<{
    markedIndex: number;
    status: "TP" | "FP";
    matchedAnswerIndex?: number;
  }>;
}

/**
 * Grade user pivot marks against frozen answer key with ±1 bar tolerance.
 */
export function gradePivotDrill(
  answerKey: IPivot[],
  userMarks: number[],
  tolerance: number = 1
): IPivotGradeResult {
  const matchedAnswers = new Set<number>();
  let tp = 0;
  let fp = 0;

  const detail: Array<{ markedIndex: number; status: "TP" | "FP"; matchedAnswerIndex?: number }> = [];

  for (const mark of userMarks) {
    const match = answerKey.find(
      (ans) => Math.abs(ans.index - mark) <= tolerance && !matchedAnswers.has(ans.index)
    );

    if (match) {
      tp++;
      matchedAnswers.add(match.index);
      detail.push({ markedIndex: mark, status: "TP", matchedAnswerIndex: match.index });
    } else {
      fp++;
      detail.push({ markedIndex: mark, status: "FP" });
    }
  }

  const fn = answerKey.length - matchedAnswers.size;

  const precision = tp + fp > 0 ? +(tp / (tp + fp)).toFixed(4) : 0;
  const recall = tp + fn > 0 ? +(tp / (tp + fn)).toFixed(4) : 0;
  const f1Score = precision + recall > 0 ? +((2 * precision * recall) / (precision + recall) * 100).toFixed(1) : 0;

  return {
    tp,
    fp,
    fn,
    precision: +(precision * 100).toFixed(1),
    recall: +(recall * 100).toFixed(1),
    f1Score,
    detail,
  };
}
