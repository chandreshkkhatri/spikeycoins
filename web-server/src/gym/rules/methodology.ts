export const RULES_VERSION = "1.0.0";

export interface ISetupType {
  id: string;
  name: string;
  description: string;
}

export const SETUP_TYPES: ISetupType[] = [
  {
    id: "pullback-to-structure",
    name: "Pullback to Structure",
    description: "Retest of a broken structural support/resistance level in trend direction",
  },
  {
    id: "breakout-retest",
    name: "Breakout Retest",
    description: "First successful retest following a range or key boundary breakout",
  },
  {
    id: "pivot-reversal",
    name: "Pivot Reversal",
    description: "Counter-trend or range-bound hinge pivot at key HTF support/resistance",
  },
  {
    id: "range-fade",
    name: "Range Fade",
    description: "Fading range extremes when HTF structure remains consolidating",
  },
  {
    id: "ma-band-pullback",
    name: "MA Band Pullback",
    description: "Dynamic support/resistance pullback to ordered 20/50 EMA band",
  },
  {
    id: "momentum-continuation",
    name: "Momentum Continuation",
    description: "High-momentum impulse continuation following a brief consolidation flag",
  },
];

export const RSI_ZONES = {
  BULLISH: { min: 60, max: 100, label: "Bullish Control (>60)" },
  BEARISH: { min: 0, max: 40, label: "Bearish Control (<40)" },
  NEUTRAL: { min: 40, max: 60, label: "Neutral Zone (40-60)" },
};

export const SETUP_GRADES = {
  FIRST_GRADE: {
    id: "FIRST_GRADE",
    label: "1st Grade Setup",
    description: "Initial clean pivot and move off structural support/resistance",
  },
  SECOND_GRADE: {
    id: "SECOND_GRADE",
    label: "2nd Grade Setup",
    description: "Secondary retest with double-top / double-bottom structural risk",
  },
};

export interface IClassificationProfile {
  id: string;
  name: string;
  maxHoldBars: number;
  maxRiskPercent: number;
}

export const CLASSIFICATION_PROFILES: IClassificationProfile[] = [
  {
    id: "scalp",
    name: "Scalp (Short Horizon)",
    maxHoldBars: 15,
    maxRiskPercent: 1.0,
  },
  {
    id: "day-trade",
    name: "Day Trade (Medium Horizon)",
    maxHoldBars: 50,
    maxRiskPercent: 1.0,
  },
  {
    id: "swing",
    name: "Swing (Long Horizon)",
    maxHoldBars: 150,
    maxRiskPercent: 0.5,
  },
];

export const SIZING_RULES = {
  minStopAtrMultiple: 1.0,
  maxRiskPercent: 2.0,
  defaultRiskPercent: 1.0,
};

export const SESSION_RULES = {
  maxConsecutiveLosses: 3,
  giveBackPct: 25,
  bufferToFullPct: 2.0,
  maxConcurrentTrades: 3,
};

export const SCORE_COMPONENTS = {
  THESIS_COMPLETE: { id: "THESIS_COMPLETE", name: "Thesis Completeness", weight: 25 },
  SETUP_VALID: { id: "SETUP_VALID", name: "Setup & Signal Validity", weight: 25 },
  INVALIDATION_RESPECTED: { id: "INVALIDATION_RESPECTED", name: "Invalidation Respected", weight: 20 },
  SIZE_CORRECT: { id: "SIZE_CORRECT", name: "Position Size Discipline", weight: 15 },
  THESIS_DISCIPLINE: { id: "THESIS_DISCIPLINE", name: "Hold & Exit Discipline", weight: 15 },
};

export function getMethodologyRulesPayload() {
  return {
    rulesVersion: RULES_VERSION,
    setupTypes: SETUP_TYPES,
    rsiZones: RSI_ZONES,
    setupGrades: SETUP_GRADES,
    classifications: CLASSIFICATION_PROFILES,
    sizingRules: SIZING_RULES,
    sessionRules: SESSION_RULES,
    scoreComponents: SCORE_COMPONENTS,
    scoreWeights: {
      THESIS_COMPLETE: 25,
      SETUP_VALID: 25,
      INVALIDATION_RESPECTED: 20,
      SIZE_CORRECT: 15,
      THESIS_DISCIPLINE: 15,
    },
  };
}

export const METHODOLOGY_RULES = getMethodologyRulesPayload();

