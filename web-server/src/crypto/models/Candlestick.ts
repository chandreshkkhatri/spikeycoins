/**
 * Candlestick Model for MongoDB/Mongoose
 * Defines the structure for storing historical candlestick data
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface ICandlestick extends Document {
  symbol: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  interval: string;
  updatedAt: Date;
}

const candlestickSchema = new Schema<ICandlestick>({
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
  interval: {
    type: String,
    required: true,
    default: '5m',
  },
}, {
  timestamps: { updatedAt: true, createdAt: false },
});

// Create compound index for efficient queries by symbol and time
candlestickSchema.index({ symbol: 1, openTime: 1 }, { unique: true });

// Index for cleanup operations with TTL
candlestickSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // 7 days TTL

// Index for symbol-based queries
candlestickSchema.index({ symbol: 1 });

export const CandlestickModel = mongoose.model<ICandlestick>('Candlestick', candlestickSchema, 'candlesticks_5m');