import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { SummaryModel } from './Summary';

describe('revision publication schema', () => {
  it('keeps legacy rows unversioned and stores new revision markers', () => {
    const row = { researchId: new Types.ObjectId(), title: 'Fixture', isPublished: true };
    expect(new SummaryModel(row).researchRevision).toBeUndefined();
    const current = new SummaryModel({ ...row, researchRevision: 2 });
    expect(current.validateSync()).toBeUndefined();
    expect(current.toObject().researchRevision).toBe(2);
  });
  it('limits publication identity uniqueness to versioned records', () => {
    expect(SummaryModel.schema.indexes()).toContainEqual([
      { researchId: 1, researchRevision: 1 }, expect.objectContaining({
        unique: true, partialFilterExpression: { researchRevision: { $exists: true } },
      }),
    ]);
  });
});
