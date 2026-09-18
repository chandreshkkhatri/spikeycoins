export interface ICorrelationPoint {
  sessionId: string;
  processScore: number;
  pnlPct: number;
  totalR: number;
  createdAt: Date;
}

/**
 * Compute Pearson correlation coefficient (r) between Process Score and PnL (% Capital).
 * Returns null if n < 3 or if variance is 0.
 */
export function calculatePearsonCorrelation(
  points: Array<{ processScore: number; pnlPct: number }>
): number | null {
  if (!points || points.length < 3) return null;

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const p of points) {
    sumX += p.processScore;
    sumY += p.pnlPct;
    sumXY += p.processScore * p.pnlPct;
    sumX2 += p.processScore * p.processScore;
    sumY2 += p.pnlPct * p.pnlPct;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0 || isNaN(denominator)) return null;

  return +(numerator / denominator).toFixed(4);
}
