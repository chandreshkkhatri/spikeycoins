import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchTickerFeed } from './ticker-feed-watchdog';

afterEach(() => vi.useRealTimers());
describe('ticker feed watchdog', () => {
  it('terminates a silent socket even if it receives transport pongs', () => {
    vi.useFakeTimers();
    const socket = Object.assign(new EventEmitter(), { terminate: vi.fn() });
    const stale = vi.fn();
    watchTickerFeed(socket as unknown as WebSocket, stale);
    socket.emit('pong');
    vi.advanceTimersByTime(60000);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(stale).toHaveBeenCalledOnce();
  });
  it('extends the deadline on data and stops checking after close', () => {
    vi.useFakeTimers();
    const socket = Object.assign(new EventEmitter(), { terminate: vi.fn() });
    const feed = watchTickerFeed(socket as unknown as WebSocket, vi.fn());
    vi.advanceTimersByTime(50000);
    feed.receivedData();
    vi.advanceTimersByTime(50000);
    expect(socket.terminate).not.toHaveBeenCalled();
    socket.emit('close');
    vi.advanceTimersByTime(60000);
    expect(socket.terminate).not.toHaveBeenCalled();
  });
});
