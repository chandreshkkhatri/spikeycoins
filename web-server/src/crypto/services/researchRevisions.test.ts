import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResearch } from '../models/Research';
import { archiveReport, replaceResearchRevision } from './researchRevisions';

const mocks = vi.hoisted(() => ({ archive: vi.fn(), replace: vi.fn() }));
vi.mock('../models/Research', () => ({ ResearchModel: { findOneAndUpdate: mocks.replace } }));
vi.mock('../models/ResearchRevision', () => ({ ResearchRevisionModel: { updateOne: mocks.archive } }));

const previous = {
  _id: 'report', revision: 2, coinSymbol: 'BTCUSDT', coinName: 'Bitcoin', timeframe: '24h',
  priceChange: 20, headline: 'Original', researchContent: 'Original report',
  evidence: { text: 'Original raw response', grounding: { original: true }, model: 'fixture' },
  sources: [{ type: 'grounded', url: 'https://example.com/original' }],
  publicationPolicyVersion: 1, isPublishable: true, publishableReason: 'Supported',
  category: 'General', impact: 'low', researchedAt: new Date('2026-09-20T00:00:00Z'),
  inputSnapshot: { id: 'original-input' }, inputSnapshotHistory: [{ id: 'original-input' }],
} as unknown as IResearch;
const replacement = { ...previous, headline: 'Replacement', researchContent: 'New report',
  isPublishable: false, publishableReason: 'Unsupported' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.archive.mockResolvedValue({});
  mocks.replace.mockResolvedValue({});
});

describe('research revision persistence', () => {
  it('preserves original report, evidence, decision, sources and inputs without copying history recursively', () => {
    expect(archiveReport(previous)).toMatchObject({
      headline: 'Original', researchContent: 'Original report', evidence: previous.evidence,
      sources: previous.sources, isPublishable: true, publishableReason: 'Supported',
      inputSnapshot: previous.inputSnapshot, researchedAt: previous.researchedAt,
    });
    expect(archiveReport(previous)).not.toHaveProperty('inputSnapshotHistory');
    expect(archiveReport(previous)).not.toHaveProperty('_id');
  });
  it('archives with insert-only semantics before a version-checked replacement', async () => {
    await replaceResearchRevision(previous, replacement);
    expect(mocks.archive).toHaveBeenCalledWith({ researchId: 'report', revision: 2 }, {
      $setOnInsert: { researchId: 'report', revision: 2, archivedAt: expect.any(Date), report: archiveReport(previous) },
    }, { upsert: true, runValidators: true });
    expect(mocks.archive.mock.invocationCallOrder[0]).toBeLessThan(mocks.replace.mock.invocationCallOrder[0]);
    expect(mocks.replace).toHaveBeenCalledWith({ _id: 'report', revision: 2 }, expect.objectContaining({
      $set: expect.objectContaining({ revision: 3, headline: 'Replacement', isPublishable: false }),
    }), { runValidators: true, new: true });
    expect(mocks.replace.mock.calls[0][1].$set).not.toHaveProperty('inputSnapshotHistory');
    expect(mocks.replace.mock.calls[0][1].$set).not.toHaveProperty('_id');
  });
  it('never replaces the current report when archive storage fails', async () => {
    mocks.archive.mockRejectedValue(new Error('Archive unavailable'));
    await expect(replaceResearchRevision(previous, replacement)).rejects.toThrow('Archive unavailable');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('rejects a stale writer instead of silently overwriting a later report', async () => {
    mocks.replace.mockResolvedValue(null);
    await expect(replaceResearchRevision(previous, replacement)).rejects.toThrow('revision conflict');
  });
  it('archives legacy rows as version zero without inventing missing evidence or inputs', async () => {
    const legacy = { ...previous, revision: undefined, evidence: undefined, inputSnapshot: undefined } as IResearch;
    await replaceResearchRevision(legacy, replacement);
    expect(mocks.archive.mock.calls[0][0]).toEqual({ researchId: 'report', revision: 0 });
    expect(mocks.archive.mock.calls[0][1].$setOnInsert.report.evidence).toBeUndefined();
    expect(mocks.archive.mock.calls[0][1].$setOnInsert.report.inputSnapshot).toBeUndefined();
    expect(mocks.replace.mock.calls[0][0]).toEqual({ _id: 'report', revision: { $exists: false } });
    expect(mocks.replace.mock.calls[0][1].$set.revision).toBe(1);
  });
});
