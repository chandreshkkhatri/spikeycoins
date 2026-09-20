/**
 * Summary Model
 * Stores market summaries that reference research entries
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface ISummary extends Document {
  researchRevision?: number;
  researchId: mongoose.Types.ObjectId;
  title: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Summary {
  researchRevision?: number;
  _id?: mongoose.Types.ObjectId;
  researchId: mongoose.Types.ObjectId;
  title: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const summarySchema = new Schema<ISummary>({
  researchRevision: { type: Number, min: 1 },
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
// Legacy rows are untouched; only versioned publication records are unique.
summarySchema.index({ researchId: 1, researchRevision: 1 }, {
  unique: true, partialFilterExpression: { researchRevision: { $exists: true } },
});

export const SummaryModel = mongoose.model<ISummary>('Summary', summarySchema);
