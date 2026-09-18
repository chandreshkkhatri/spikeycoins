export interface ISizingParams {
  capital: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
  atr?: number;
  minStopAtrMultiple?: number;
  qtyStep?: number;
}

export interface ISizingResult {
  valid: boolean;
  quantity: number;
  riskAmount: number;
  riskPerUnit: number;
  reason?: string;
}

/**
 * Pure position sizing calculator.
 * Enforces risk cap by strictly rounding quantity down to qtyStep.
 * Enforces minimum ATR stop distance floor (breathing room).
 */
export function calculatePositionSize({
  capital,
  riskPercent,
  entryPrice,
  stopLoss,
  atr = 0,
  minStopAtrMultiple = 1.0,
  qtyStep = 1,
}: ISizingParams): ISizingResult {
  if (capital <= 0 || riskPercent <= 0) {
    return {
      valid: false,
      quantity: 0,
      riskAmount: 0,
      riskPerUnit: 0,
      reason: "Capital and risk percent must be positive",
    };
  }

  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  if (riskPerUnit === 0) {
    return {
      valid: false,
      quantity: 0,
      riskAmount: 0,
      riskPerUnit: 0,
      reason: "Stop loss cannot equal entry price",
    };
  }

  // Breathing room check against ATR
  if (atr > 0 && minStopAtrMultiple > 0) {
    const minDistance = minStopAtrMultiple * atr;
    if (riskPerUnit < minDistance) {
      return {
        valid: false,
        quantity: 0,
        riskAmount: 0,
        riskPerUnit,
        reason: `Stop distance (${riskPerUnit.toFixed(2)}) is below the required ATR floor (${minDistance.toFixed(2)})`,
      };
    }
  }

  const riskAmount = capital * (riskPercent / 100);
  const rawQuantity = riskAmount / riskPerUnit;

  // Round DOWN to qtyStep to guarantee quantity * riskPerUnit <= riskAmount
  const steps = Math.floor(rawQuantity / qtyStep);
  const quantity = +(steps * qtyStep).toFixed(4);

  if (quantity <= 0) {
    return {
      valid: false,
      quantity: 0,
      riskAmount,
      riskPerUnit,
      reason: "Calculated position quantity is zero",
    };
  }

  return {
    valid: true,
    quantity,
    riskAmount: +(quantity * riskPerUnit).toFixed(2),
    riskPerUnit: +riskPerUnit.toFixed(4),
  };
}

/**
 * Calculate total active capital risk exposure across open/pending trades.
 */
export function aggregateExposure(trades: Array<{ status: string; riskAmount?: number }>): number {
  return trades.reduce((sum, trade) => {
    if (trade.status === "OPEN" || trade.status === "PENDING") {
      return sum + (trade.riskAmount || 0);
    }
    return sum;
  }, 0);
}
