import { SETUP_TYPES, CLASSIFICATION_PROFILES, SIZING_RULES, SESSION_RULES } from "../rules/methodology";
import { calculatePositionSize } from "./sizing";

export interface IGovernorState {
  riskTier: "WARMUP" | "REDUCED" | "FULL";
  consecutiveLosses: number;
  peakBufferPct: number;
  isHalted: boolean;
  haltReason: string | null;
  breachAttempts?: Array<{
    candleIndex: number;
    ruleId: string;
    reason: string;
    timestamp: Date;
  }>;
}

export interface IGovernorSessionState {
  currentCandleIndex: number;
  startingCapital?: number;
  capital?: number;
  totalPnl: number;
  trades: Array<{
    status: string;
    pnl: number | null;
    pnlCash?: number | null;
    rMultiple?: number | null;
  }>;
  governor?: IGvernorState;
  config?: {
    maxConsecutiveLosses?: number;
    giveBackPct?: number;
    bufferToFullPct?: number;
    minStopAtrMultiple?: number;
    maxConcurrentTrades?: number;
  };
}

export interface IGovernorResult {
  allowed: boolean;
  riskTier: "WARMUP" | "REDUCED" | "FULL";
  isHalted: boolean;
  haltReason: string | null;
  ruleId?: string;
}

export type IGvernorState = IGovernorState;

/**
 * Evaluate mechanical risk governor on every trade placement or session update.
 */
export function evaluateGovernor(state: IGovernorSessionState): IGovernorResult {
  const maxConsecutiveLosses = state.config?.maxConsecutiveLosses ?? SESSION_RULES.maxConsecutiveLosses;
  const giveBackPct = state.config?.giveBackPct ?? SESSION_RULES.giveBackPct;
  const bufferToFullPct = state.config?.bufferToFullPct ?? SESSION_RULES.bufferToFullPct;

  const governor: IGovernorState = state.governor || {
    riskTier: "WARMUP",
    consecutiveLosses: 0,
    peakBufferPct: 0,
    isHalted: false,
    haltReason: null,
    breachAttempts: [],
  };

  // 1. If already halted, remain halted
  if (governor.isHalted) {
    return {
      allowed: false,
      riskTier: governor.riskTier,
      isHalted: true,
      haltReason: governor.haltReason,
      ruleId: "GOVERNOR_HALTED",
    };
  }

  // 2. Count consecutive losses from most recent closed trades
  let consecutiveLosses = 0;
  let runningPnl = 0;
  let peakBufferPct = 0;
  const startingCapital = state.startingCapital ?? 100000;

  const closedTrades = state.trades.filter(
    (t) => t.status === "CLOSED" || t.status === "STOPPED_OUT" || t.status === "TARGET_HIT"
  );

  for (let i = closedTrades.length - 1; i >= 0; i--) {
    const trade = closedTrades[i];
    if (trade.pnl != null && trade.pnl < 0) {
      consecutiveLosses++;
    } else {
      break;
    }
  }

  // Calculate overall cumulative PnL %
  for (const trade of closedTrades) {
    runningPnl += startingCapital > 0 ? ((trade.pnlCash ?? 0) / startingCapital) * 100 : 0;
    peakBufferPct = Math.max(peakBufferPct, runningPnl);
  }

  governor.consecutiveLosses = consecutiveLosses;
  governor.peakBufferPct = +peakBufferPct.toFixed(4);

  // 3. Rule: Consecutive losses exceeded
  if (consecutiveLosses >= maxConsecutiveLosses) {
    governor.isHalted = true;
    governor.haltReason = `Halted: Exceeded maximum consecutive losses limit (${maxConsecutiveLosses})`;
    state.governor = governor;
    return {
      allowed: false,
      riskTier: governor.riskTier,
      isHalted: true,
      haltReason: governor.haltReason,
      ruleId: "CONSECUTIVE_LOSSES_EXCEEDED",
    };
  }

  // 4. Rule: Peak buffer give-back exceeded (gave back 25% of peak buffer)
  if (peakBufferPct >= 2.0) {
    const drawdownPct = peakBufferPct - runningPnl;
    const giveBackRatio = (drawdownPct / peakBufferPct) * 100;

    if (giveBackRatio >= giveBackPct) {
      governor.isHalted = true;
      governor.haltReason = `Halted: Gave back ${giveBackRatio.toFixed(1)}% of peak buffer (limit ${giveBackPct}%)`;
      state.governor = governor;
      return {
        allowed: false,
        riskTier: governor.riskTier,
        isHalted: true,
        haltReason: governor.haltReason,
        ruleId: "PEAK_BUFFER_GIVEBACK_EXCEEDED",
      };
    }
  }

  // 5. Rule: Profitable session returned to flat/negative
  if (peakBufferPct >= 1.5 && runningPnl <= 0) {
    governor.isHalted = true;
    governor.haltReason = "Halted: Profitable session returned to flat or negative";
    state.governor = governor;
    return {
      allowed: false,
      riskTier: governor.riskTier,
      isHalted: true,
      haltReason: governor.haltReason,
      ruleId: "PROFITABLE_SESSION_RETURNED_TO_FLAT",
    };
  }

  // 6. Tier transitions
  let riskTier: "WARMUP" | "REDUCED" | "FULL" = "WARMUP";
  if (runningPnl >= bufferToFullPct) {
    riskTier = "FULL";
  } else if (consecutiveLosses > 0 || runningPnl < 0) {
    riskTier = "REDUCED";
  } else {
    riskTier = "WARMUP";
  }

  governor.consecutiveLosses = consecutiveLosses;
  governor.peakBufferPct = peakBufferPct;
  governor.riskTier = riskTier;
  state.governor = governor;

  return {
    allowed: true,
    riskTier,
    isHalted: false,
    haltReason: null,
  };
}

export interface IThesisInput {
  setupType: string;
  side: "LONG" | "SHORT";
  triggerPrice: number;
  invalidationPrice: number;
  plannedStop: number;
  targetPrice: number;
  classification?: string;
  plannedRiskPercent?: number;
}

export interface IThesisValidationResult {
  valid: boolean;
  autoChecks: Array<{ id: string; name: string; passed: boolean; reason?: string }>;
  calculatedQuantity: number;
  riskAmount: number;
  riskPerUnit: number;
  reason?: string;
}

/**
 * Validate trade thesis and compute position size.
 */
export function validateThesis(
  input: IThesisInput,
  sessionState: IGovernorSessionState,
  currentPrice: number,
  atr: number = 0
): IThesisValidationResult {
  const autoChecks: Array<{ id: string; name: string; passed: boolean; reason?: string }> = [];

  // 1. Setup Type Check
  const validSetup = SETUP_TYPES.some((s) => s.id === input.setupType);
  autoChecks.push({
    id: "SETUP_DECLARED",
    name: "Valid Setup Declared",
    passed: validSetup,
    reason: validSetup ? undefined : "Selected setup type is unrecognized",
  });

  // 2. Ordering Check
  let orderingPassed = false;
  let orderingReason: string | undefined;

  if (input.side === "LONG") {
    orderingPassed =
      input.plannedStop <= input.invalidationPrice &&
      input.invalidationPrice < input.triggerPrice &&
      input.triggerPrice < input.targetPrice;
    if (!orderingPassed) {
      orderingReason = "LONG requirement: Stop <= Invalidation < Trigger < Target";
    }
  } else {
    orderingPassed =
      input.plannedStop >= input.invalidationPrice &&
      input.invalidationPrice > input.triggerPrice &&
      input.triggerPrice > input.targetPrice;
    if (!orderingPassed) {
      orderingReason = "SHORT requirement: Stop >= Invalidation > Trigger > Target";
    }
  }

  autoChecks.push({
    id: "PRICE_ORDERING",
    name: "Price Ordering (Invalidation / Stop / Trigger / Target)",
    passed: orderingPassed,
    reason: orderingReason,
  });

  // 3. Structural Invalidation Distance
  const stopBeyondInvalidation =
    input.side === "LONG"
      ? input.plannedStop <= input.invalidationPrice
      : input.plannedStop >= input.invalidationPrice;

  autoChecks.push({
    id: "STRUCTURAL_INVALIDATION",
    name: "Stop Beyond Structural Level",
    passed: stopBeyondInvalidation,
    reason: stopBeyondInvalidation ? undefined : "Planned stop must be at or beyond structural invalidation level",
  });

  // 4. Breathing Room (ATR Floor)
  const minStopAtrMultiple = sessionState.config?.minStopAtrMultiple ?? SIZING_RULES.minStopAtrMultiple;
  const riskPerUnit = Math.abs(input.triggerPrice - input.plannedStop);
  const minDistanceNeeded = minStopAtrMultiple * atr;

  const breathingRoomPassed = atr === 0 || riskPerUnit >= minDistanceNeeded;
  autoChecks.push({
    id: "BREATHING_ROOM",
    name: "ATR Breathing Room Floor",
    passed: breathingRoomPassed,
    reason: breathingRoomPassed
      ? undefined
      : `Stop distance (${riskPerUnit.toFixed(2)}) is tighter than the ATR floor (${minDistanceNeeded.toFixed(2)})`,
  });

  // 5. Classification Profile Consistency
  const profile = CLASSIFICATION_PROFILES.find((c) => c.id === input.classification);
  const maxRiskAllowed = profile ? profile.maxRiskPercent : SIZING_RULES.defaultRiskPercent;
  const requestedRisk = input.plannedRiskPercent || SIZING_RULES.defaultRiskPercent;
  const classificationPassed = requestedRisk <= maxRiskAllowed;

  autoChecks.push({
    id: "CLASSIFICATION_CONSISTENCY",
    name: "Classification Risk Limit",
    passed: classificationPassed,
    reason: classificationPassed
      ? undefined
      : `Requested risk (${requestedRisk}%) exceeds classification limit (${maxRiskAllowed}%)`,
  });

  const allPassed = autoChecks.every((c) => c.passed);

  // Calculate server position sizing
  const capital = sessionState.capital ?? sessionState.startingCapital ?? 100000;
  const governorRes = evaluateGovernor(sessionState);
  const tierFactor = governorRes.riskTier === "FULL" ? 1.0 : 0.5;
  const effectiveRiskPct = Math.min(requestedRisk, maxRiskAllowed) * tierFactor;

  const sizingRes = calculatePositionSize({
    capital,
    riskPercent: effectiveRiskPct,
    entryPrice: input.triggerPrice,
    stopLoss: input.plannedStop,
    atr,
    minStopAtrMultiple,
  });

  return {
    valid: allPassed && sizingRes.valid,
    autoChecks,
    calculatedQuantity: sizingRes.quantity,
    riskAmount: sizingRes.riskAmount,
    riskPerUnit: sizingRes.riskPerUnit,
    reason: !allPassed
      ? autoChecks.find((c) => !c.passed)?.reason
      : !sizingRes.valid
      ? sizingRes.reason
      : undefined,
  };
}
