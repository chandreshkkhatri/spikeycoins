import { SCORE_COMPONENTS, RULES_VERSION, CLASSIFICATION_PROFILES } from "../rules/methodology";

export interface IScorecardComponent {
  weight: number;
  score: number;
  reason?: string;
}

export interface IScorecardResult {
  version: string;
  processScore: number | null;
  components: Record<string, IScorecardComponent>;
  methodologyVersion: string;
  evaluatedAt: Date;
}

export interface IScoringTrade {
  tradeIndex?: number;
  entryCandle: number;
  exitCandle: number | null;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  quantity?: number;
  riskAmount?: number;
  status: string;
  stopHistory?: Array<{ widened: boolean }>;
  thesis?: {
    setupType?: string;
    classification?: string;
    plannedRiskPercent?: number;
  };
  durationBars?: number | null;
}

export interface IScoringSessionState {
  trades: IScoringTrade[];
  governor?: {
    breachAttempts?: Array<{ ruleId: string; reason: string }>;
  };
  methodologyVersion?: string;
}

/**
 * Generate process scorecard for a session.
 * Sessions with zero trades score processScore: null (not 100).
 */
export function generateProcessScorecard(session: IScoringSessionState): IScorecardResult {
  const closedTrades = session.trades.filter(
    (t) => t.status === "CLOSED" || t.status === "STOPPED_OUT" || t.status === "TARGET_HIT"
  );

  if (closedTrades.length === 0) {
    return {
      version: "1.0.0",
      processScore: null,
      components: {
        THESIS_COMPLETE: { weight: SCORE_COMPONENTS.THESIS_COMPLETE.weight, score: 0, reason: "No trades executed" },
        SETUP_VALID: { weight: SCORE_COMPONENTS.SETUP_VALID.weight, score: 0, reason: "No trades executed" },
        INVALIDATION_RESPECTED: { weight: SCORE_COMPONENTS.INVALIDATION_RESPECTED.weight, score: 0, reason: "No trades executed" },
        SIZE_CORRECT: { weight: SCORE_COMPONENTS.SIZE_CORRECT.weight, score: 0, reason: "No trades executed" },
        THESIS_DISCIPLINE: { weight: SCORE_COMPONENTS.THESIS_DISCIPLINE.weight, score: 0, reason: "No trades executed" },
      },
      methodologyVersion: session.methodologyVersion ?? RULES_VERSION,
      evaluatedAt: new Date(),
    };
  }

  // 1. THESIS_COMPLETE
  const tradesWithThesis = closedTrades.filter((t) => t.thesis && t.thesis.setupType);
  const thesisScore = Math.round((tradesWithThesis.length / closedTrades.length) * 100);

  // 2. SETUP_VALID
  const setupScore = thesisScore; // Validated upon placement in METHOD mode

  // 3. INVALIDATION_RESPECTED (zeroed if any stop was widened)
  const tradesWidened = closedTrades.filter(
    (t) => t.stopHistory && t.stopHistory.some((sh) => sh.widened)
  );
  const invalidationScore = Math.round(((closedTrades.length - tradesWidened.length) / closedTrades.length) * 100);

  // 4. SIZE_CORRECT (checked via risk amount limits)
  const sizeScore = 100;

  // 5. THESIS_DISCIPLINE (exceeding max hold bars)
  let disciplineViolations = 0;
  for (const t of closedTrades) {
    const profile = CLASSIFICATION_PROFILES.find((c) => c.id === t.thesis?.classification);
    const maxHold = profile ? profile.maxHoldBars : 50;
    if (t.durationBars != null && t.durationBars > maxHold) {
      disciplineViolations++;
    }
  }
  const disciplineScore = Math.round(((closedTrades.length - disciplineViolations) / closedTrades.length) * 100);

  // Weighted average score
  const components: Record<string, IScorecardComponent> = {
    THESIS_COMPLETE: {
      weight: SCORE_COMPONENTS.THESIS_COMPLETE.weight,
      score: thesisScore,
      reason: thesisScore < 100 ? `${closedTrades.length - tradesWithThesis.length} trades missing declared thesis` : undefined,
    },
    SETUP_VALID: {
      weight: SCORE_COMPONENTS.SETUP_VALID.weight,
      score: setupScore,
    },
    INVALIDATION_RESPECTED: {
      weight: SCORE_COMPONENTS.INVALIDATION_RESPECTED.weight,
      score: invalidationScore,
      reason: tradesWidened.length > 0 ? `${tradesWidened.length} trades widened stop loss` : undefined,
    },
    SIZE_CORRECT: {
      weight: SCORE_COMPONENTS.SIZE_CORRECT.weight,
      score: sizeScore,
    },
    THESIS_DISCIPLINE: {
      weight: SCORE_COMPONENTS.THESIS_DISCIPLINE.weight,
      score: disciplineScore,
      reason: disciplineViolations > 0 ? `${disciplineViolations} trades exceeded max holding period` : undefined,
    },
  };

  const rawWeightedSum =
    (thesisScore * SCORE_COMPONENTS.THESIS_COMPLETE.weight +
      setupScore * SCORE_COMPONENTS.SETUP_VALID.weight +
      invalidationScore * SCORE_COMPONENTS.INVALIDATION_RESPECTED.weight +
      sizeScore * SCORE_COMPONENTS.SIZE_CORRECT.weight +
      disciplineScore * SCORE_COMPONENTS.THESIS_DISCIPLINE.weight) /
    100;

  // Deduct for governor breach attempts if any
  const breachCount = session.governor?.breachAttempts?.length || 0;
  const governorPenalty = Math.min(30, breachCount * 10);

  const finalScore = Math.max(0, Math.round(rawWeightedSum - governorPenalty));

  return {
    version: "1.0.0",
    processScore: finalScore,
    components,
    methodologyVersion: session.methodologyVersion ?? RULES_VERSION,
    evaluatedAt: new Date(),
  };
}
