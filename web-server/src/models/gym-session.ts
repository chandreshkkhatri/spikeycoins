import mongoose, { Document, Model, Schema } from "mongoose";

export interface IStopHistoryEntry {
  atCandle: number;
  from: number;
  to: number;
  widened: boolean;
}

export interface IGymThesisAutoCheck {
  id: string;
  name: string;
  passed: boolean;
  reason?: string;
}

export interface IGymThesis {
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
  autoChecks?: IGymThesisAutoCheck[];
  attestations?: Record<string, boolean>;
  createdAtCandle?: number;
  resolvedAtCandle?: number;
  resolution?: string;
}

export interface IGymTrade {
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
  durationBars?: number | null;
  status: "PENDING" | "OPEN" | "CLOSED" | "STOPPED_OUT" | "TARGET_HIT" | "CANCELED";
  type: "MARKET" | "LIMIT";
  invalidationPrice?: number;
  stopHistory?: IStopHistoryEntry[];
  thesis?: IGymThesis;
}

const GymTradeSchema = new Schema<IGymTrade>(
  {
    tradeIndex: { type: Number },
    entryCandle: { type: Number, required: true },
    exitCandle: { type: Number, default: null },
    side: { type: String, enum: ["LONG", "SHORT"], required: true },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, default: null },
    stopLoss: { type: Number, required: true },
    takeProfit: { type: Number, required: true },
    pnl: { type: Number, default: null },
    pnlCash: { type: Number, default: null },
    rMultiple: { type: Number, default: null },
    quantity: { type: Number },
    riskAmount: { type: Number },
    riskPerUnit: { type: Number },
    durationBars: { type: Number, default: null },
    status: {
      type: String,
      enum: ["PENDING", "OPEN", "CLOSED", "STOPPED_OUT", "TARGET_HIT", "CANCELED"],
      default: "OPEN",
    },
    type: { type: String, enum: ["MARKET", "LIMIT"], default: "MARKET" },
    invalidationPrice: { type: Number },
    stopHistory: [
      {
        atCandle: Number,
        from: Number,
        to: Number,
        widened: Boolean,
      },
    ],
    thesis: {
      setupType: String,
      thesisTimeframe: String,
      triggerPrice: Number,
      invalidationPrice: Number,
      plannedStop: Number,
      targetPrice: Number,
      classification: String,
      plannedRiskPercent: Number,
      plannedQuantity: Number,
      addPlan: String,
      exitPlan: String,
      notes: String,
      autoChecks: [
        {
          id: String,
          name: String,
          passed: Boolean,
          reason: String,
        },
      ],
      attestations: Schema.Types.Mixed,
      createdAtCandle: Number,
      resolvedAtCandle: Number,
      resolution: String,
    },
  },
  { _id: false }
);

export interface ICandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface IGymSessionConfig {
  maxConsecutiveLosses: number;
  giveBackPct: number;
  warmupSizeFactor: number;
  reducedSizeFactor: number;
  bufferToFullPct: number;
  minStopAtrMultiple: number;
  maxConcurrentTrades: number;
}

export interface IGymGovernor {
  riskTier: "WARMUP" | "REDUCED" | "FULL";
  consecutiveLosses: number;
  peakBufferPct: number;
  isHalted: boolean;
  haltReason: string | null;
  breachAttempts: Array<{
    candleIndex: number;
    ruleId: string;
    reason: string;
    timestamp: Date;
  }>;
}

export interface IGymScorecard {
  version: string;
  processScore: number | null;
  components: Record<string, { weight: number; score: number; reason?: string }>;
  methodologyVersion: string;
  evaluatedAt: Date;
}

export interface IGymSession extends Document {
  userId: string;
  createdAt: Date;
  updatedAt: Date;

  schemaVersion: number;
  mode: "FREE" | "METHOD";

  // Hidden from user until reveal
  actualSymbol: string;
  actualStartTimestamp: number;
  interval: string;
  priceMultiplier: number;
  volumeDivisor: number;

  startingCapital?: number;
  capital?: number;
  riskPercent?: number;
  totalPnlCash?: number;
  totalR?: number;
  feeBps?: number;

  warmupCandles?: ICandleData[];
  candles: ICandleData[];

  warmupLowerCandles?: ICandleData[];
  lowerCandles?: ICandleData[];
  lowerInterval?: string;

  warmupHigherCandles?: ICandleData[];
  higherCandles?: ICandleData[];
  higherInterval?: string;

  currentCandleIndex: number;
  initialCandleCount: number;
  trades: IGymTrade[];
  totalPnl: number;
  status: "ACTIVE" | "COMPLETED" | "REVEALED" | "ABANDONED";
  endedAt?: Date;

  config?: IGymSessionConfig;
  governor?: IGymGovernor;
  scorecard?: IGymScorecard;
  methodologyVersion?: string;
}

const CandleSchema = {
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  timestamp: Number,
};

const GymSessionSchema = new Schema<IGymSession>(
  {
    userId: { type: String, required: true, index: true },
    schemaVersion: { type: Number, default: 1 },
    mode: { type: String, enum: ["FREE", "METHOD"], default: "FREE" },
    actualSymbol: { type: String, required: true },
    actualStartTimestamp: { type: Number, required: true },
    interval: { type: String, required: true },
    priceMultiplier: { type: Number, required: true },
    volumeDivisor: { type: Number, default: 1 },

    startingCapital: { type: Number },
    capital: { type: Number },
    riskPercent: { type: Number },
    totalPnlCash: { type: Number, default: 0 },
    totalR: { type: Number, default: 0 },
    feeBps: { type: Number, default: 0 },

    warmupCandles: [CandleSchema],
    candles: [CandleSchema],

    warmupLowerCandles: [CandleSchema],
    lowerCandles: [CandleSchema],
    lowerInterval: { type: String },

    warmupHigherCandles: [CandleSchema],
    higherCandles: [CandleSchema],
    higherInterval: { type: String },

    currentCandleIndex: { type: Number, default: 50 },
    initialCandleCount: { type: Number, default: 50 },
    trades: [GymTradeSchema],
    totalPnl: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "REVEALED", "ABANDONED"],
      default: "ACTIVE",
    },
    endedAt: { type: Date },

    config: {
      maxConsecutiveLosses: { type: Number, default: 3 },
      giveBackPct: { type: Number, default: 25 },
      warmupSizeFactor: { type: Number, default: 0.5 },
      reducedSizeFactor: { type: Number, default: 0.5 },
      bufferToFullPct: { type: Number, default: 2 },
      minStopAtrMultiple: { type: Number, default: 1.0 },
      maxConcurrentTrades: { type: Number, default: 3 },
    },

    governor: {
      riskTier: { type: String, enum: ["WARMUP", "REDUCED", "FULL"], default: "WARMUP" },
      consecutiveLosses: { type: Number, default: 0 },
      peakBufferPct: { type: Number, default: 0 },
      isHalted: { type: Boolean, default: false },
      haltReason: { type: String, default: null },
      breachAttempts: [
        {
          candleIndex: Number,
          ruleId: String,
          reason: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],
    },

    scorecard: {
      version: String,
      processScore: Number,
      components: Schema.Types.Mixed,
      methodologyVersion: String,
      evaluatedAt: Date,
    },
    methodologyVersion: { type: String },
  },
  {
    timestamps: true,
  }
);

GymSessionSchema.index({ userId: 1, status: 1 });
GymSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });

const GymSession: Model<IGymSession> =
  mongoose.models?.GymSession ||
  mongoose.model<IGymSession>("GymSession", GymSessionSchema);

export default GymSession;
