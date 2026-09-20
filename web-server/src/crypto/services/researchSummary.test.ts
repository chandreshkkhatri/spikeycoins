import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesResearchRevision, recordResearchPublication } from './researchSummary';

const update = vi.hoisted(() => vi.fn());
vi.mock('../models/Summary', () => ({ SummaryModel: { updateOne: update } }));
const publication = { researchId: 'report', revision: 2, title: 'New report', isPublished: true,
  publishedAt: new Date('2026-09-20T18:00:00Z') };

beforeEach(() => { update.mockReset(); update.mockResolvedValue({}); });
describe('revision-bound publication', () => {
  it('inserts by revision without modifying a previous publication decision or date on retry', async () => {
    await recordResearchPublication(publication);
    expect(update).toHaveBeenCalledWith({ researchId: 'report', researchRevision: 2 }, {
      $setOnInsert: { researchId: 'report', researchRevision: 2, title: 'New report',
        isPublished: true, publishedAt: publication.publishedAt },
    }, { upsert: true, runValidators: true });
  });
  it.each([true, false])('a delayed older record cannot change revision 2 (published: %s)', async currentPublished => {
    const records = new Map<number, { researchRevision: number; isPublished: boolean }>();
    update.mockImplementation(async (_filter, operation) => {
      const row = operation.$setOnInsert;
      if (!records.has(row.researchRevision)) records.set(row.researchRevision, row);
      return {};
    });
    await recordResearchPublication({ ...publication, isPublished: currentPublished });
    await recordResearchPublication({ ...publication, revision: 1, isPublished: !currentPublished });
    const visible = [...records.values()].filter(row => row.isPublished &&
      matchesResearchRevision({ ...row, research: { revision: 2 } }));
    expect(visible.map(row => row.researchRevision)).toEqual(currentPublished ? [2] : []);
  });
  it('fails closed during a missing-publication gap and does not bind legacy markers to new reports', () => {
    expect(matchesResearchRevision({ researchRevision: 1, research: { revision: 2 } })).toBe(false);
    expect(matchesResearchRevision({ research: { revision: 2 } })).toBe(false);
    expect(matchesResearchRevision({ research: {} })).toBe(true);
    expect(matchesResearchRevision({ researchRevision: 2, research: { revision: 2 } })).toBe(true);
  });
  it('surfaces storage failure instead of reporting successful publication', async () => {
    update.mockRejectedValue(new Error('Unavailable'));
    await expect(recordResearchPublication(publication)).rejects.toThrow('Unavailable');
  });
  it.each([0, -1, 1.5, NaN])('rejects invalid revision %s', async revision => {
    await expect(recordResearchPublication({ ...publication, revision })).rejects.toThrow('Invalid publication revision');
    expect(update).not.toHaveBeenCalled();
  });
});
