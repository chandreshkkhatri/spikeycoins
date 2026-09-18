/**
 * Gym Domain Types (Frontend)
 * Mirrored from web-server/src/models/gym-session.ts and web-server/src/gym/
 */

export interface GymCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface GymStopHistoryEntry {
  atCandle: number;
  from: number;
  to: number;
  widened: boolean;
}

export interface GymThesisAutoCheck {
  id: string;
  name: string;
  passed: boolean;
  reason?: string;
}

export interface GymThesis {
  setupType: string;
  thesisTimeframe?: string;
  triggerPrice: number;
  invalidationPrice: number;
  plannedStop: number;
  targetPrice: number;
  classification?: string;
  plannedRiskPercent?: number;
  plannedQuantity?: number;
  addPlan?: string;
  exitPlan?: string;
  notes?: string;
  autoChecks?: GymThesisAutoCheck[];
  attestations?: Record<string, boolean>;
  createdAtCandle?: number;
  resolvedAtCandle?: number;
  resolution?: string;
}

export interface GymTrade {
  tradeIndex?: number;
  entryCandle: number;
  exitCandle: number | null;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  pnl: number | null;
  pnlCash?: number | null;
  rMultiple?: number | null;
  quantity?: number;
  riskAmount?: number;
  riskPerUnit?: number;
  initialStopLoss?: number;
  durationBars?: number | null;
  status: "PENDING" | "OPEN" | "CLOSED" | "STOPPED_OUT" | "TARGET_HIT" | "CANCELED";
  type: "MARKET" | "LIMIT";
  invalidationPrice?: number;
  stopHistory?: GymStopHistoryEntry[];
  thesis?: GymThesis;
}

export interface GymGovernor {
  riskTier: "WARMUP" | "REDUCED" | "FULL";
  consecutiveLosses: number;
  peakBufferPct: number;
  isHalted: boolean;
  haltReason: string | null;
  breachAttempts?: Array<{
    candleIndex: number;
    ruleId: string;
    reason: string;
    timestamp: string;
  }>;
}

export interface GymScorecardComponent {
  weight: number;
  score: number;
  reason?: string;
}

export interface GymScorecard {
  version: string;
  processScore: number | null;
  components: Record<string, GymScorecardComponent>;
  methodologyVersion: string;
  evaluatedAt: string;
}

export interface GymSession {
  id: string;
  schemaVersion: number;
  mode: "FREE" | "METHOD";
  interval: string;
  currentCandleIndex: number;
  totalCandles: number;
  candles: GymCandle[];
  lowerInterval?: string;
  lowerCandles?: GymCandle[];
  higherInterval?: string;
  higherCandles?: GymCandle[];
  trades: GymTrade[];
  totalPnl: number;
  totalPnlCash: number;
  totalR: number;
  capital?: number;
  startingCapital?: number;
  riskPercent?: number;
  status: "ACTIVE" | "COMPLETED" | "REVEALED" | "ABANDONED";
  actualSymbol?: string;
  actualStartTimestamp?: number;
  methodologyVersion?: string;
  endedAt?: string;
  governor?: GymGovernor;
  scorecard?: GymScorecard;
}

export interface GymSessionSummary {
  id: string;
  schemaVersion: number;
  mode: "FREE" | "METHOD";
  interval: string;
  status: string;
  totalPnl: number;
  totalPnlCash: number;
  totalR: number;
  createdAt: string;
  actualSymbol?: string;
}

export interface MethodologyRuleConfig {
  setupTypes: Array<{ id: string; name: string; description: string }>;
  rsiZones: Record<string, { min: number; max: number; label: string }>;
  setupGrades: Record<string, { label: string; description: string }>;
  classifications: Array<{ id: string; name: string; maxHoldBars: number; maxRiskPct: number }>;
  sizingRules: {
    minStopAtrMultiple: number;
    maxRiskPercent: number;
    defaultRiskPercent: number;
  };
  sessionRules: {
    maxConsecutiveLosses: number;
    giveBackPct: number;
    bufferToFullPct: number;
  };
  rulesVersion: string;
}
