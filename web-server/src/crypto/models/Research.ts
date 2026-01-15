/**
 * Research Model
 * Stores research data about cryptocurrency market movements
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IResearch extends Document {
  coinSymbol: string;
  coinName: string;
  priceChange: number;
  timeframe: '24h' | '7d';
  researchContent: string;
  sources: {
    type: 'reddit' | 'news' | 'forum' | 'twitter' | 'other';
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
  _id?: mongoose.Types.ObjectId;
  coinSymbol: string;
  coinName: string;
  priceChange: number;
  timeframe: '24h' | '7d';
  researchContent: string;
  sources: {
    type: 'reddit' | 'news' | 'forum' | 'twitter' | 'other';
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

const researchSchema = new Schema<IResearch>({
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
      enum: ['reddit', 'news', 'forum', 'twitter', 'other'],
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
