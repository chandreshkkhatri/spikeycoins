import mongoose, { Document, Model, Schema } from "mongoose";

export interface IJournalTrade extends Document {
  accountId: string;
  userId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  positionSide: "BOTH" | "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  entryTime: Date;
  exitTime: Date | null;
  duration: number | null;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  maxQty: number;
  realizedPnl: number;
  commission: number;
  netPnl: number;
  // Running state for open trades (resume processing on next sync)
  currentQty: number;
  weightedEntryNumerator: number;
  entryQty: number;
  // Fill tracking
  fillIds: number[];
  fillCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const JournalTradeSchema = new Schema<IJournalTrade>(
  {
    accountId: { type: String, required: true },
    userId: { type: String, required: true },
    symbol: { type: String, required: true },
    direction: { type: String, enum: ["LONG", "SHORT"], required: true },
    positionSide: {
      type: String,
      enum: ["BOTH", "LONG", "SHORT"],
      required: true,
    },
    status: { type: String, enum: ["OPEN", "CLOSED"], required: true },
    entryTime: { type: Date, required: true },
    exitTime: { type: Date, default: null },
    duration: { type: Number, default: null },
    avgEntryPrice: { type: Number, required: true },
    avgExitPrice: { type: Number, default: null },
    maxQty: { type: Number, required: true },
    realizedPnl: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    netPnl: { type: Number, default: 0 },
    currentQty: { type: Number, default: 0 },
    weightedEntryNumerator: { type: Number, default: 0 },
    entryQty: { type: Number, default: 0 },
    fillIds: { type: [Number], default: [] },
    fillCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

JournalTradeSchema.index({ accountId: 1, status: 1, entryTime: -1 });
JournalTradeSchema.index({ accountId: 1, exitTime: -1 });
JournalTradeSchema.index({ accountId: 1, symbol: 1, status: 1 });

const JournalTrade: Model<IJournalTrade> =
  mongoose.models?.JournalTrade ||
  mongoose.model<IJournalTrade>("JournalTrade", JournalTradeSchema);

export default JournalTrade;
