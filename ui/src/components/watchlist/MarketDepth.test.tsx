import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketDepth from "./MarketDepth";

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { Socket.instances.push(this); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
const props = { symbol: "BTCUSDT", currentPrice: 100, onPriceSelect: vi.fn() };
const frame = () => ({ s: "BTCUSDT", E: Date.now(), a: [["101", "2"]], b: [["99", "3"]] });
const send = (data: unknown, socket = Socket.instances.at(-1)!) => act(() => {
  socket.message(data);
  vi.advanceTimersByTime(250);
});
const rows = (container: HTMLElement) => container.querySelectorAll(".depth-row");

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  props.onPriceSelect.mockReset();
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MarketDepth", () => {
  it("waits for actual Futures data, then offers verified prices", () => {
    const { container } = render(<MarketDepth {...props} />);
    expect(Socket.instances[0].url).toBe("wss://fstream.binance.com/public/ws/btcusdt@depth20@100ms");
    expect(rows(container)).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for live depth");
    send(frame());
    expect(rows(container)).toHaveLength(2);
    fireEvent.click(rows(container)[0]);
    expect(props.onPriceSelect).toHaveBeenCalledWith("102");
  });

  it("supports Spot payloads on the Spot stream", () => {
    const { container } = render(<MarketDepth {...props} marketType="binance-spot" />);
    expect(Socket.instances[0].url).toContain("stream.binance.com:9443/ws/");
    send({ asks: [["101", "2"]], bids: [["99", "3"]] });
    expect(rows(container)).toHaveLength(2);
  });

  it("rejects stale clicks even before suspended timers run", () => {
    const { container } = render(<MarketDepth {...props} />);
    send(frame());
    vi.setSystemTime(Date.now() + 11000);
    fireEvent.click(rows(container)[0]);
    expect(props.onPriceSelect).not.toHaveBeenCalled();
  });

  it("rejects malformed, wrong-symbol and delayed events", () => {
    const { container } = render(<MarketDepth {...props} />);
    send({ ...frame(), s: "ETHUSDT" });
    send({ ...frame(), E: Date.now() - 11000 });
    send({ ...frame(), a: [["NaN", "1"]] });
    send({ ...frame(), b: [["99", "-3"]] });
    expect(rows(container)).toHaveLength(0);
  });

  it("expires silent data and reconnects without showing old levels", () => {
    const { container } = render(<MarketDepth {...props} />);
    send(frame());
    act(() => vi.advanceTimersByTime(10000));
    expect(rows(container)).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(Socket.instances).toHaveLength(2);
    send(frame());
    expect(rows(container)).toHaveLength(2);
  });

  it("clears pending data on disconnect and retries", () => {
    const { container } = render(<MarketDepth {...props} />);
    act(() => {
      Socket.instances[0].message(frame());
      Socket.instances[0].onclose?.();
      vi.advanceTimersByTime(250);
    });
    expect(rows(container)).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(Socket.instances).toHaveLength(2);
  });

  it("cannot carry old-symbol levels or queued callbacks into a new selection", () => {
    const { container, rerender, unmount } = render(<MarketDepth {...props} />);
    send(frame());
    const oldHandler = Socket.instances[0].onmessage!;
    rerender(<MarketDepth {...props} symbol="ETHUSDT" />);
    act(() => {
      oldHandler({ data: JSON.stringify(frame()) });
      vi.advanceTimersByTime(250);
    });
    expect(rows(container)).toHaveLength(0);
    send({ ...frame(), s: "ETHUSDT" });
    expect(rows(container)).toHaveLength(2);
    unmount();
    act(() => vi.advanceTimersByTime(60000));
    expect(Socket.instances).toHaveLength(2);
  });

  it("does not fabricate depth for unsupported accounts", () => {
    const { container } = render(<MarketDepth {...props} accountType="upstox" />);
    expect(Socket.instances).toHaveLength(0);
    expect(rows(container)).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Depth unavailable");
  });
});
