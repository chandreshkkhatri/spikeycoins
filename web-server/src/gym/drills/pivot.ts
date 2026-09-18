import { Pivot } from "../ta/types";

export interface PivotDrillGrade {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export function gradePivotDrill(
  answerKey: Pivot[],
  userMarks: number[],
  tolerance: number = 1
): PivotDrillGrade {
  const targetIndices = answerKey.map((p) => p.index);
  let truePositives = 0;
  const matchedTargets = new Set<number>();

  for (const mark of userMarks) {
    const match = targetIndices.find(
      (t) => !matchedTargets.has(t) && Math.abs(t - mark) <= tolerance
    );

    if (match !== undefined) {
      truePositives++;
      matchedTargets.add(match);
    }
  }

  const falsePositives = userMarks.length - truePositives;
  const falseNegatives = targetIndices.length - truePositives;

  const precision =
    userMarks.length === 0 ? 0 : truePositives / userMarks.length;
  const recall =
    targetIndices.length === 0 ? 0 : truePositives / targetIndices.length;
  const f1Score =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1Score: Math.round(f1Score * 100) / 100,
  };
}
