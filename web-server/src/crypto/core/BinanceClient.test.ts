import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BinanceClient from './BinanceClient';

vi.mock('ws');
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: {
      ...mockAxiosInstance,
      create: vi.fn(() => mockAxiosInstance),
    },
  };
});

vi.mock('./DataManager', () => ({
  default: {
    updateTickers: vi.fn(),
    updateFuturesTickers: vi.fn(),
    getTopSymbolsByVolume: vi.fn().mockReturnValue([]),
  },
}));
vi.mock('../services/MarketCapService', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/CandlestickStorage', () => ({
  default: {
    initialize: vi.fn(),
    saveCandlesticks: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
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

describe('BinanceClient', () => {
  let client: BinanceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    client = new BinanceClient();
  });

  afterEach(() => {
    client.cleanup();
    vi.useRealTimers();
  });

  it('should continue exponential reconnect backoff beyond 5 attempts capped at 60s', () => {
    const connectTickerSpy = vi.spyOn(client as any, 'connectTickerStream').mockImplementation(() => {});

    // Simulate 10 consecutive disconnects and verify reconnects keep happening
    for (let i = 1; i <= 10; i++) {
      (client as any).handleReconnect();
      expect((client as any).reconnectAttempts).toBe(i);

      // Expected delay is min(1000 * 1.5^i, 60000)
      const expectedDelay = Math.min(1000 * Math.pow(1.5, Math.min(i, 12)), 60000);
      expect(expectedDelay).toBeLessThanOrEqual(60000);

      // Fast-forward by expected delay to trigger connectTickerStream
      vi.advanceTimersByTime(expectedDelay);
      expect(connectTickerSpy).toHaveBeenCalledTimes(i);
    }
  });

  it('should continue futures exponential reconnect backoff beyond 5 attempts capped at 60s', () => {
    const connectFuturesSpy = vi.spyOn(client as any, 'connectFuturesTickerStream').mockImplementation(() => {});

    for (let i = 1; i <= 8; i++) {
      (client as any).handleFuturesReconnect();
      expect((client as any).futuresReconnectAttempts).toBe(i);

      const expectedDelay = Math.min(1000 * Math.pow(1.5, Math.min(i, 12)), 60000);
      expect(expectedDelay).toBeLessThanOrEqual(60000);

      vi.advanceTimersByTime(expectedDelay);
      expect(connectFuturesSpy).toHaveBeenCalledTimes(i);
    }
  });

  it('should expose feedHealth and stale indicators in getStatus()', () => {
    const statusBefore = client.getStatus();
    expect(statusBefore.connected).toBe(false);
    expect(statusBefore.futuresConnected).toBe(false);
    expect(statusBefore.feedHealth.spot.isStale).toBe(true);
    expect(statusBefore.feedHealth.futures.isStale).toBe(true);

    // Simulate receiving recent spot and futures messages
    const now = Date.now();
    (client as any).isConnected = true;
    (client as any).isFuturesConnected = true;
    (client as any).lastSpotMessageTime = now;
    (client as any).lastFuturesMessageTime = now;

    const statusAfter = client.getStatus();
    expect(statusAfter.connected).toBe(true);
    expect(statusAfter.futuresConnected).toBe(true);
    expect(statusAfter.feedHealth.spot.isStale).toBe(false);
    expect(statusAfter.feedHealth.futures.isStale).toBe(false);
    expect(statusAfter.feedHealth.spot.lastMessageAt).toBe(new Date(now).toISOString());

    // Advance 65s without messages -> should become stale
    vi.advanceTimersByTime(65000);
    const statusStale = client.getStatus();
    expect(statusStale.feedHealth.spot.isStale).toBe(true);
    expect(statusStale.feedHealth.futures.isStale).toBe(true);
  });
});
