import { ResearchModel, type IResearch } from '../models/Research';
import { ResearchRevisionModel, type ArchivedReport } from '../models/ResearchRevision';

type Replacement = Pick<IResearch, 'headline' | 'evidence' | 'publicationPolicyVersion' |
  'priceChange' | 'researchContent' | 'sources' | 'isPublishable' | 'publishableReason' |
  'category' | 'impact' | 'inputSnapshot'>;

export function archiveReport(previous: IResearch): ArchivedReport {
  return {
    revision: previous.revision,
    coinSymbol: previous.coinSymbol, coinName: previous.coinName,
    timeframe: previous.timeframe, priceChange: previous.priceChange,
    headline: previous.headline, researchContent: previous.researchContent,
    evidence: previous.evidence, sources: previous.sources,
    publicationPolicyVersion: previous.publicationPolicyVersion,
    isPublishable: previous.isPublishable, publishableReason: previous.publishableReason,
    category: previous.category, impact: previous.impact,
    inputSnapshot: previous.inputSnapshot, researchedAt: previous.researchedAt,
    createdAt: previous.createdAt, updatedAt: previous.updatedAt,
  };
}

/** Archive first; a failed archive or stale writer must not replace the report. */
export async function replaceResearchRevision(previous: IResearch, replacement: Replacement): Promise<void> {
  const revision = previous.revision ?? 0;
  await ResearchRevisionModel.updateOne(
    { researchId: previous._id, revision },
    { $setOnInsert: { researchId: previous._id, revision, archivedAt: new Date(), report: archiveReport(previous) } },
    { upsert: true, runValidators: true },
  );
  const updated = await ResearchModel.findOneAndUpdate({
    _id: previous._id,
    revision: previous.revision === undefined ? { $exists: false } : previous.revision,
  }, {
    $set: {
      headline: replacement.headline, evidence: replacement.evidence,
      publicationPolicyVersion: replacement.publicationPolicyVersion,
      priceChange: replacement.priceChange, researchContent: replacement.researchContent,
      sources: replacement.sources, isPublishable: replacement.isPublishable,
      publishableReason: replacement.publishableReason, category: replacement.category,
      impact: replacement.impact, inputSnapshot: replacement.inputSnapshot,
      revision: revision + 1, researchedAt: new Date(), updatedAt: new Date(),
    },
    $push: { inputSnapshotHistory: replacement.inputSnapshot },
  }, { runValidators: true, new: true });
  if (!updated) throw new Error('Research revision conflict; report was not replaced');
}
