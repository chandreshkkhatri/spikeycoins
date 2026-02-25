/**
 * Daily Candlestick Model for MongoDB/Mongoose
 * Separate collection for 1-day candlestick data used by DailyCandlestickService.
 * 
 * This is intentionally separate from the 5m Candlestick model to avoid:
 * 1. Unique index conflicts (5m candles at midnight share the same openTime as daily candles)
 * 2. Cleanup interference (5m cleanup keeps only 288 candles per symbol)
 * 3. TTL boundary issues (5m TTL is 7 days, exactly where we need daily data)
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IDailyCandlestick extends Document {
  symbol: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  updatedAt: Date;
}

const dailyCandlestickSchema = new Schema<IDailyCandlestick>({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  openTime: {
    type: Number,
    required: true,
  },
  open: {
    type: Number,
    required: true,
  },
  high: {
    type: Number,
    required: true,
  },
  low: {
    type: Number,
    required: true,
  },
  close: {
    type: Number,
    required: true,
  },
  volume: {
    type: Number,
    required: true,
  },
  closeTime: {
    type: Number,
    required: true,
  },
}, {
  timestamps: { updatedAt: true, createdAt: false },
});

// Compound unique index — one daily candle per symbol per day
dailyCandlestickSchema.index({ symbol: 1, openTime: 1 }, { unique: true });

// TTL: keep daily candles for 14 days (generous buffer beyond the 7d we need)
dailyCandlestickSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

// Index for range queries used by calculate7dChanges
dailyCandlestickSchema.index({ symbol: 1, openTime: -1 });

export const DailyCandlestickModel = mongoose.model<IDailyCandlestick>(
  'DailyCandlestick',
  dailyCandlestickSchema,
  'candlesticks_daily'
);
