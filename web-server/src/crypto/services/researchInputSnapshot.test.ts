import { describe, expect, it } from 'vitest';
import { snapshot24h, snapshot7d } from './researchInputSnapshot';
import { ResearchModel } from '../models/Research';

const ticker = { s: 'BTCUSDT', price: 120, change_24h: 20, volume_usd: 500000,
  last_updated: '2026-09-20T18:00:00.000Z', is_futures: false,
  o: '100', O: Date.parse('2026-09-19T18:00:00Z'), C: Date.parse('2026-09-20T18:00:00Z') };

describe('research input snapshots', () => {
  it('copies exchange observations without reconstructing a reference from the return', () => {
    const source = { ...ticker, change_24h: 19.99 };
    const snapshot = snapshot24h(source);
    source.price = 999;
    expect(snapshot).toMatchObject({ price: 120, priceChange: 19.99, referencePrice: 100,
      referenceTime: '2026-09-19T18:00:00.000Z', exchangeCloseTime: ticker.last_updated,
      observedAt: ticker.last_updated, venue: 'binance-spot', eligibilityPolicyVersion: 1 });
    expect(snapshot24h(ticker).id).not.toBe(snapshot.id);
  });
  it('records unavailable reference fields as null and distinguishes Futures', () => {
    expect(snapshot24h({ ...ticker, is_futures: true, o: undefined, O: undefined, C: NaN }))
      .toMatchObject({ venue: 'binance-usdm-futures', referencePrice: null,
        referenceTime: null, exchangeCloseTime: null });
  });
  it('retains the exact daily open needed to reproduce the calendar return', () => {
    const snapshot = snapshot7d({ symbol: 'BTCUSDT', price: 120, priceChange: 20,
      volume: 500000, observedAt: ticker.last_updated, referencePrice: 100,
      referenceTime: '2026-09-13T00:00:00.000Z' });
    expect((snapshot.price / snapshot.referencePrice! - 1) * 100).toBeCloseTo(snapshot.priceChange);
    expect(snapshot).toMatchObject({ timeframe: '7d', windowMethod: 'utc-calendar-7d', venue: 'binance-spot' });
  });
  it('round-trips the typed snapshot schema without a database', () => {
    const snapshot = snapshot24h(ticker);
    const report = { coinSymbol: 'BTCUSDT', coinName: 'Bitcoin', priceChange: 20,
      timeframe: '24h', researchContent: 'Fixture', isPublishable: false };
    const document = new ResearchModel({ ...report, inputSnapshot: snapshot, inputSnapshotHistory: [snapshot] });
    expect(document.validateSync()).toBeUndefined();
    expect(document.toObject().inputSnapshot).toEqual(snapshot);
    expect(document.toObject().inputSnapshotHistory).toEqual([snapshot]);
    const legacy = new ResearchModel(report);
    expect(legacy.validateSync()).toBeUndefined();
    expect(legacy.inputSnapshot).toBeUndefined();
    expect(legacy.inputSnapshotHistory).toBeUndefined();
  });
});
