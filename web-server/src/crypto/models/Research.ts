/**
 * Research Model
 * Stores research data about cryptocurrency market movements
 */

import mongoose, { Document, Schema } from 'mongoose';
import type { ResearchEvidence } from '../services/researchPublication';
import type { ResearchInputSnapshot } from '../services/researchInputSnapshot';

export interface IResearch extends Document {
  inputSnapshot?: ResearchInputSnapshot;
  inputSnapshotHistory?: ResearchInputSnapshot[];
  headline?: string;
  evidence?: ResearchEvidence;
  publicationPolicyVersion?: number;
  coinSymbol: string;
  coinName: string;
  priceChange: number;
  timeframe: '24h' | '7d';
  researchContent: string;
  sources: {
    type: string;
    url: string;
    title?: string;
    summary?: string;
  }[];
  isPublishable: boolean;
  publishableReason?: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  researchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Research {
  inputSnapshot?: ResearchInputSnapshot;
  inputSnapshotHistory?: ResearchInputSnapshot[];
  headline?: string;
  evidence?: ResearchEvidence;
  publicationPolicyVersion?: number;
  _id?: mongoose.Types.ObjectId;
  coinSymbol: string;
  coinName: string;
  priceChange: number;
  timeframe: '24h' | '7d';
  researchContent: string;
  sources: {
    type: string;
    url: string;
    title?: string;
    summary?: string;
  }[];
  isPublishable: boolean;
  publishableReason?: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  researchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inputSnapshotSchema = new Schema<ResearchInputSnapshot>({
  id: { type: String, required: true },
  version: { type: Number, enum: [1], required: true },
  capturedAt: { type: String, required: true },
  symbol: { type: String, required: true },
  venue: { type: String, enum: ['binance-spot', 'binance-usdm-futures'], required: true },
  timeframe: { type: String, enum: ['24h', '7d'], required: true },
  windowMethod: { type: String, enum: ['exchange-24h-ticker', 'utc-calendar-7d'], required: true },
  observedAt: { type: String, required: true },
  price: { type: Number, required: true },
  priceChange: { type: Number, required: true },
  quoteTurnover: { type: Number, required: true },
  quoteAsset: { type: String, enum: ['USDT'], required: true },
  referencePrice: { type: Number, default: null },
  referenceTime: { type: String, default: null },
  exchangeCloseTime: { type: String, default: null },
  eligibilityPolicyVersion: { type: Number, enum: [1], required: true },
}, { _id: false });

const researchSchema = new Schema<IResearch>({
  // Optional for legacy rows; never backfill guessed historical observations.
  inputSnapshot: { type: inputSnapshotSchema, default: undefined },
  inputSnapshotHistory: { type: [inputSnapshotSchema], default: undefined },
  headline: String,
  // Normalized and gated by the publication policy before use.
  evidence: Schema.Types.Mixed,
  publicationPolicyVersion: Number,
  coinSymbol: {
    type: String,
    required: true,
    index: true,
    uppercase: true,
  },
  coinName: {
    type: String,
    required: true,
  },
  priceChange: {
    type: Number,
    required: true,
  },
  timeframe: {
    type: String,
    enum: ['24h', '7d'],
    required: true,
  },
  researchContent: {
    type: String,
    required: true,
  },
  sources: [{
    type: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    title: String,
    summary: String,
  }],
  isPublishable: {
    type: Boolean,
    required: true,
    default: false,
    index: true,
  },
  publishableReason: {
    type: String,
  },
  category: {
    type: String,
    required: true,
    default: 'General',
  },
  impact: {
    type: String,
    enum: ['high', 'medium', 'low'],
    required: true,
    default: 'medium',
  },
  researchedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Compound index for querying publishable research by date
researchSchema.index({ isPublishable: 1, researchedAt: -1 });
researchSchema.index({ coinSymbol: 1, researchedAt: -1 });

export const ResearchModel = mongoose.model<IResearch>('Research', researchSchema);
