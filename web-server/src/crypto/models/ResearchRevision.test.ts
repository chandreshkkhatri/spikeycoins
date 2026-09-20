import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { ResearchRevisionModel } from './ResearchRevision';

describe('research revision schema', () => {
  it('retains original legacy payloads without applying current report defaults', () => {
    const report = { researchContent: 'Legacy report', sources: [], isPublishable: false };
    const revision = new ResearchRevisionModel({ researchId: new Types.ObjectId(), revision: 0,
      archivedAt: new Date(), report });
    expect(revision.validateSync()).toBeUndefined();
    expect(revision.toObject().report).toEqual(report);
    expect(revision.toObject().report).not.toHaveProperty('evidence');
    expect(revision.toObject().report).not.toHaveProperty('inputSnapshot');
  });
  it('declares a unique identity per report/version and immutable archive fields', () => {
    expect(ResearchRevisionModel.schema.indexes()).toContainEqual([
      { researchId: 1, revision: 1 }, expect.objectContaining({ unique: true }),
    ]);
    for (const field of ['researchId', 'revision', 'archivedAt', 'report']) {
      expect(ResearchRevisionModel.schema.path(field).options.immutable).toBe(true);
    }
  });
});
