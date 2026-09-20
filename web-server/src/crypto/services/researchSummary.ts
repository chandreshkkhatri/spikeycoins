import type { IResearch } from '../models/Research';
import { SummaryModel } from '../models/Summary';

/** Each accepted report revision owns its publication record; no cross-revision updates. */
export async function recordResearchPublication(input: {
  researchId: IResearch['_id']; revision: number; title: string; isPublished: boolean; publishedAt: Date;
}): Promise<void> {
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error('Invalid publication revision');
  await SummaryModel.updateOne({ researchId: input.researchId, researchRevision: input.revision }, {
    $setOnInsert: {
      researchId: input.researchId, researchRevision: input.revision,
      title: input.title, isPublished: input.isPublished, publishedAt: input.publishedAt,
    },
  }, { upsert: true, runValidators: true });
}

export function matchesResearchRevision(summary: { researchRevision?: number; research?: { revision?: number } }): boolean {
  return summary.researchRevision === summary.research?.revision;
}
