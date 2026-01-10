import mongoose, { Document, Model, Schema } from "mongoose";

// Individual trade within a gym session
export interface IGymTrade {
  entryCandle: number;       // Index in the loaded candles when trade was opened
  exitCandle: number | null; // Index when trade was closed
  side: "LONG" | "SHORT";
  entryPrice: number;        // Normalized/obfuscated price
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  pnl: number | null;        // Calculated on close
  status: "OPEN" | "CLOSED" | "STOPPED_OUT" | "TARGET_HIT";
}

const GymTradeSchema = new Schema<IGymTrade>(
  {
    entryCandle: { type: Number, required: true },
    exitCandle: { type: Number, default: null },
    side: { type: String, enum: ["LONG", "SHORT"], required: true },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, default: null },
    stopLoss: { type: Number, required: true },
    takeProfit: { type: Number, required: true },
    pnl: { type: Number, default: null },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED", "STOPPED_OUT", "TARGET_HIT"],
      default: "OPEN",
    },
  },
  { _id: false }
);

// Gym session document
export interface IGymSession extends Document {
  userId: string;
  createdAt: Date;
  
  // Hidden from user until reveal
  actualSymbol: string;
  actualStartTimestamp: number;  // Start timestamp of the candle data
  interval: string;
  priceMultiplier: number;       // For price obfuscation
  
  // Loaded candle data (stored to avoid re-fetching)
  candles: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
  }>;
  
  // Visible state
  currentCandleIndex: number;    // How many candles are revealed
  initialCandleCount: number;    // Starting number of visible candles
  trades: IGymTrade[];
  totalPnl: number;
  status: "ACTIVE" | "COMPLETED" | "REVEALED";
}

const GymSessionSchema = new Schema<IGymSession>(
  {
    userId: { type: String, required: true, index: true },
    actualSymbol: { type: String, required: true },
    actualStartTimestamp: { type: Number, required: true },
    interval: { type: String, required: true },
    priceMultiplier: { type: Number, required: true },
    candles: [
      {
        open: Number,
        high: Number,
        low: Number,
        close: Number,
        volume: Number,
        timestamp: Number,
      },
    ],
    currentCandleIndex: { type: Number, default: 50 }, // Start with 50 candles visible
    initialCandleCount: { type: Number, default: 50 },
    trades: [GymTradeSchema],
    totalPnl: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "REVEALED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

// Index for finding user's active sessions
GymSessionSchema.index({ userId: 1, status: 1 });

const GymSession: Model<IGymSession> =
  mongoose.models?.GymSession ||
  mongoose.model<IGymSession>("GymSession", GymSessionSchema);

export default GymSession;
