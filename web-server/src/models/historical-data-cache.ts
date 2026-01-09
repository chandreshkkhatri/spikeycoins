import mongoose, { Document, Model, Schema } from "mongoose";

// Individual candle document - one per candle
export interface ICandle extends Document {
  symbol: string;
  interval: string;
  marketType: string;
  timestamp: number; // candle open time in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const CandleSchema = new Schema<ICandle>(
  {
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    marketType: { type: String, required: true },
    timestamp: { type: Number, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  {
    // No timestamps needed - candle data is immutable
  }
);

// Compound unique index - one candle per symbol/interval/marketType/timestamp
CandleSchema.index(
  { symbol: 1, interval: 1, marketType: 1, timestamp: 1 },
  { unique: true }
);

// Index for efficient range queries
CandleSchema.index({ symbol: 1, interval: 1, marketType: 1, timestamp: -1 });

const HistoricalDataCache: Model<ICandle> =
  mongoose.models?.HistoricalDataCache ||
  mongoose.model<ICandle>("HistoricalDataCache", CandleSchema);

export default HistoricalDataCache;
