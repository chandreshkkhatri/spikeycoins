/**
 * Summary Model
 * Stores market summaries that reference research entries
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface ISummary extends Document {
  researchId: mongoose.Types.ObjectId;
  title: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Summary {
  _id?: mongoose.Types.ObjectId;
  researchId: mongoose.Types.ObjectId;
  title: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const summarySchema = new Schema<ISummary>({
  researchId: {
    type: Schema.Types.ObjectId,
    ref: 'Research',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  isPublished: {
    type: Boolean,
    required: true,
    default: false,
    index: true,
  },
  publishedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Compound index for querying published summaries by date
summarySchema.index({ isPublished: 1, createdAt: -1 });

export const SummaryModel = mongoose.model<ISummary>('Summary', summarySchema);
