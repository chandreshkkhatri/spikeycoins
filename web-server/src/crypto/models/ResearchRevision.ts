import mongoose, { Schema } from 'mongoose';
import type { Research } from './Research';

export type ArchivedReport = Omit<Research, '_id' | 'inputSnapshotHistory'>;
export interface ResearchRevision {
  researchId: mongoose.Types.ObjectId;
  revision: number;
  archivedAt: Date;
  report: ArchivedReport;
}

const schema = new Schema<ResearchRevision>({
  researchId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  revision: { type: Number, required: true, min: 0, immutable: true },
  archivedAt: { type: Date, required: true, immutable: true },
  // Preserve original/legacy evidence as stored, without re-running today's policy.
  report: { type: Schema.Types.Mixed, required: true, immutable: true },
});
schema.index({ researchId: 1, revision: 1 }, { unique: true });
export const ResearchRevisionModel = mongoose.model<ResearchRevision>('ResearchRevision', schema);
