import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DailyCandlestickService from './DailyCandlestickService';
import DataManager from '../core/DataManager';
import { DailyCandlestickModel, type IDailyCandlestick } from '../models/DailyCandlestick';

vi.mock('../core/DataManager', () => ({
  default: {
    getAllTickers: vi.fn(),
  },
}));

vi.mock('../models/DailyCandlestick', () => ({
  DailyCandlestickModel: {
    find: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('DailyCandlestickService', () => {
  let service: DailyCandlestickService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T18:00:00Z'));
    service = DailyCandlestickService.getInstance();
    // Never perform live database/backfill work in these unit tests.
    (service as unknown as { isBackfilling: boolean }).isBackfilling = true;
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  describe('7d calendar day alignment', () => {
    it('should query candlesticks matching 7 UTC calendar days ago', async () => {
      vi.mocked(DataManager.getAllTickers).mockReturnValue([
        { s: 'BTCUSDT', price: 65000, change_24h: 1.2, volume_usd: 5000000,
          last_updated: new Date().toISOString(), is_futures: false } as ReturnType<typeof DataManager.getAllTickers>[number],
      ]);

      vi.mocked(DailyCandlestickModel.find).mockResolvedValue([
        { symbol: 'BTCUSDT', open: 60000, openTime: Date.parse('2026-09-13T00:00:00Z') } as IDailyCandlestick,
      ]);

      const now = new Date();
      const expectedMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const expected7DaysAgoMidnight = expectedMidnightUTC - 7 * 24 * 60 * 60 * 1000;

      const changes = await service.calculate7dChanges();

      expect(DailyCandlestickModel.find).toHaveBeenCalled();
      const queryArg = vi.mocked(DailyCandlestickModel.find).mock.calls[0][0]!;
      expect(queryArg.symbol).toEqual({ $in: ['BTCUSDT'] });
      expect(queryArg.openTime).toBe(expected7DaysAgoMidnight);

      expect(changes.length).toBe(1);
      expect(changes[0].symbol).toBe('BTC');
      expect(changes[0].change_7d).toBeCloseTo(((65000 - 60000) / 60000) * 100);
      expect(changes[0]).toMatchObject({
        referenceTime: '2026-09-13T00:00:00.000Z',
        observedAt: '2026-09-20T18:00:00.000Z', windowMethod: 'utc-calendar-7d',
      });
    });
    it.each(['2026-09-20T00:00:00Z', '2026-09-20T23:59:59Z', '2026-09-21T00:00:00Z'])(
      'uses the exact UTC reference at %s and preserves a real zero return', async timestamp => {
        vi.setSystemTime(new Date(timestamp));
        const reference = Math.floor(Date.now() / 86400000) * 86400000 - 7 * 86400000;
        vi.mocked(DataManager.getAllTickers).mockReturnValue([
          { s: 'BTCUSDT', price: 100, change_24h: 1, volume_usd: 5000,
            last_updated: timestamp, is_futures: false } as ReturnType<typeof DataManager.getAllTickers>[number],
        ]);
        vi.mocked(DailyCandlestickModel.find).mockResolvedValue([
          { symbol: 'BTCUSDT', open: 100, openTime: reference } as IDailyCandlestick,
        ]);
        expect(await service.calculate7dChanges()).toEqual([
          expect.objectContaining({ change_7d: 0, referenceTime: new Date(reference).toISOString() }),
        ]);
      });
    it.each([
      { open: 0 }, { open: NaN }, { open: Infinity },
      { openTime: Date.parse('2026-09-13T01:00:00Z') },
    ])('rejects unusable historical reference %j', async invalid => {
      vi.mocked(DataManager.getAllTickers).mockReturnValue([
        { s: 'BTCUSDT', price: 100, change_24h: 1, volume_usd: 5000,
          last_updated: new Date().toISOString(), is_futures: false } as ReturnType<typeof DataManager.getAllTickers>[number],
      ]);
      vi.mocked(DailyCandlestickModel.find).mockResolvedValue([
        { symbol: 'BTCUSDT', open: 100, openTime: Date.parse('2026-09-13T00:00:00Z'), ...invalid } as IDailyCandlestick,
      ]);
      expect(await service.calculate7dChanges()).toEqual([]);
    });
    it('excludes stale observations and Futures-only instruments before querying Spot history', async () => {
      const ticker = { s: 'BTCUSDT', price: 100, change_24h: 1, volume_usd: 100000,
        last_updated: new Date().toISOString(), is_futures: false };
      vi.mocked(DataManager.getAllTickers).mockReturnValue([
        { ...ticker, last_updated: '2026-09-20T17:00:00Z' },
        { ...ticker, is_futures: true },
      ] as ReturnType<typeof DataManager.getAllTickers>);
      expect(await service.calculate7dChanges()).toEqual([]);
      expect(DailyCandlestickModel.find).not.toHaveBeenCalled();
    });
  });

  describe('sign filtering in get7dTopMovers', () => {
    it('should strictly filter gainers to > 0 and losers to < 0', async () => {
      vi.spyOn(service, 'calculate7dChanges').mockResolvedValue([
        { symbol: 'BTC', name: 'BTC', price: '65000', change_24h: 2, change_7d: 8.5, volume: '1000' },
        { symbol: 'ETH', name: 'ETH', price: '3500', change_24h: 1, change_7d: 4.2, volume: '1000' },
        { symbol: 'SOL', name: 'SOL', price: '140', change_24h: -1, change_7d: -5.0, volume: '1000' },
        { symbol: 'DOGE', name: 'DOGE', price: '0.12', change_24h: -3, change_7d: -12.3, volume: '1000' },
      ]);

      const { gainers, losers } = await service.get7dTopMovers();

      expect(gainers.every((g) => g.change_7d > 0)).toBe(true);
      expect(gainers.length).toBe(2);
      expect(gainers[0].symbol).toBe('BTC'); // +8.5%

      expect(losers.every((l) => l.change_7d < 0)).toBe(true);
      expect(losers.length).toBe(2);
      expect(losers[0].symbol).toBe('DOGE'); // -12.3%
    });

    it('should return empty gainers array when all market 7d changes are negative', async () => {
      vi.spyOn(service, 'calculate7dChanges').mockResolvedValue([
        { symbol: 'BTC', name: 'BTC', price: '60000', change_24h: -2, change_7d: -4.5, volume: '1000' },
        { symbol: 'ETH', name: 'ETH', price: '3000', change_24h: -4, change_7d: -9.2, volume: '1000' },
        { symbol: 'SOL', name: 'SOL', price: '120', change_24h: -6, change_7d: -15.0, volume: '1000' },
      ]);

      const { gainers, losers } = await service.get7dTopMovers();

      expect(gainers).toEqual([]);
      expect(losers.length).toBe(3);
      expect(losers[0].symbol).toBe('SOL');
    });

    it('should return empty losers array when all market 7d changes are positive', async () => {
      vi.spyOn(service, 'calculate7dChanges').mockResolvedValue([
        { symbol: 'BTC', name: 'BTC', price: '68000', change_24h: 5, change_7d: 12.0, volume: '1000' },
        { symbol: 'ETH', name: 'ETH', price: '3800', change_24h: 3, change_7d: 7.5, volume: '1000' },
      ]);

      const { gainers, losers } = await service.get7dTopMovers();

      expect(gainers.length).toBe(2);
      expect(losers).toEqual([]);
    });
  });
});
