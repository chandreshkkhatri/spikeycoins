"use client";

import { memo, useEffect, useState, useMemo, useRef } from "react";
import { formatPrice, formatQuantity, calculatePriceDecimals } from "@/lib/format-utils";
import { GripHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MarketDepthProps {
  symbol: string;
  currentPrice: number;
  onPriceSelect: (price: string) => void;
  accountType?: "binance" | "upstox";
  marketType?: string;
}

interface OrderBookItem {
  price: number;
  quantity: number;
  total: number;
}

const aggregateOrders = (orders: OrderBookItem[], tickSize: number, type: 'ask' | 'bid') => {
  if (!tickSize || tickSize <= 0) return orders;

  const grouped = new Map<number, OrderBookItem>();

  orders.forEach((order) => {
    // Calculate the rounded down price based on tick size
    // Example: 0.2563 with tick 0.001 -> 0.256
    const factor = 1 / tickSize;
    // Use a small epsilon for float stability before flooring
    const priceKey = (type === 'ask'
      ? Math.ceil(order.price * factor - 0.0000001)
      : Math.floor(order.price * factor + 0.0000001)) / factor;

    // Normalize to avoid 0.30000000004
    // Count decimals in tickSize, but cap at 8 to avoid toFixed() errors
    const decimals = tickSize.toFixed(8).replace(/0+$/, '').split('.')[1]?.length || 0;
    const normalizedPrice = parseFloat(priceKey.toFixed(decimals));

    const existing = grouped.get(normalizedPrice);
    if (existing) {
      existing.quantity += order.quantity;
      existing.total += order.total;
    } else {
      grouped.set(normalizedPrice, {
        price: normalizedPrice,
        quantity: order.quantity,
        total: order.total,
      });
    }
  });

  const result = Array.from(grouped.values());

  // Sort: Asks ascending, Bids descending
  return result.sort((a, b) => type === 'ask' ? a.price - b.price : b.price - a.price);
};

const MarketDepth = memo(function MarketDepth({
  symbol,
  currentPrice,
  onPriceSelect,
  accountType = "binance",
  marketType = "binance-futures",
}: MarketDepthProps) {
  const [asks, setAsks] = useState<OrderBookItem[]>([]);
  const [bids, setBids] = useState<OrderBookItem[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedPrecision, setPrecision] = useState<number | null>(null);
  const [rowCount, setRowCount] = useState(7);

  // Throttle state updates to reduce re-renders
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<{ asks: OrderBookItem[], bids: OrderBookItem[] } | null>(null);
  const lastDepthAt = useRef(0);
  const selectPrice = (price: string) => {
    // This callback runs only on a user click, never during render.
    // eslint-disable-next-line react-hooks/purity
    if (wsConnected && Date.now() - lastDepthAt.current < 10000) {
      onPriceSelect(price);
    }
  };

  const availablePrecisions = useMemo(() => {
    const prices = [...asks, ...bids].map(item => item.price).sort((a, b) => a - b);
    let difference = Infinity;
    for (let i = 1; i < prices.length; i++) {
      const gap = prices[i] - prices[i - 1];
      if (gap > 0) difference = Math.min(difference, gap);
    }
    if (!Number.isFinite(difference)) return [];
    const base = Number(difference.toFixed(8));
    if (base <= 0) return [];
    return Array.from({ length: 5 }, (_, i) => Number((base * 10 ** i).toFixed(8)))
      .filter(step => step <= prices[prices.length - 1]);
  }, [asks, bids]);
  const precision = selectedPrecision ?? availablePrecisions[0] ?? null;

  useEffect(() => {
    if (!symbol || accountType !== "binance") return;

    const isFutures = marketType === "binance-futures";
    const base = isFutures
      ? "wss://fstream.binance.com/public/ws"
      : "wss://stream.binance.com:9443/ws";
    let socket: WebSocket | null = null;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

    const clearBook = () => {
      lastDepthAt.current = 0;
      setWsConnected(false);
      setAsks([]);
      setBids([]);
      pendingDataRef.current = null;
      if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    };
    const close = () => {
      if (!socket) return;
      const previous = socket;
      socket = null;
      previous.onmessage = null;
      previous.onerror = null;
      previous.onclose = null;
      // Closing a CONNECTING socket produces noisy browser errors.
      previous.onopen = () => previous.close();
      if (previous.readyState === WebSocket.OPEN) previous.close();
    };
    const reconnect = () => {
      if (disposed || retry) return;
      clearBook();
      clearTimeout(watchdog);
      close();
      retry = setTimeout(() => {
        retry = undefined;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    };
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(reconnect, 10000);
    };
    const connect = () => {
      if (disposed) return;
      try {
        const connection = new WebSocket(
          `${base}/${symbol.toLowerCase()}@depth20@100ms`
        );
        socket = connection;
        armWatchdog();
        connection.onmessage = (event) => {
          if (disposed || socket !== connection) return;
          try {
            const data = JSON.parse(event.data);
            if (isFutures && data.s !== symbol.toUpperCase()) return;
            const parseLevels = (levels: unknown): OrderBookItem[] | null => {
              if (!Array.isArray(levels) || levels.length === 0) return null;
              const parsed: OrderBookItem[] = [];
              for (const level of levels) {
                if (!Array.isArray(level) || level.length < 2) return null;
                const price = Number(level[0]);
                const quantity = Number(level[1]);
                if (!Number.isFinite(price) || price <= 0 ||
                    !Number.isFinite(quantity) || quantity < 0 ||
                    !Number.isFinite(price * quantity)) return null;
                if (quantity > 0) parsed.push({ price, quantity, total: price * quantity });
              }
              return parsed.length ? parsed : null;
            };
            const nextAsks = parseLevels(isFutures ? data.a : data.asks);
            const nextBids = parseLevels(isFutures ? data.b : data.bids);
            if (!nextAsks || !nextBids) return;
            // Reject delayed Futures events; connection state alone is not freshness.
            if (isFutures && (!Number.isFinite(data.E) ||
                Math.abs(Date.now() - data.E) > 10000)) return;
            armWatchdog();
            lastDepthAt.current = Date.now();
            retryDelay = 1000;
            pendingDataRef.current = { asks: nextAsks, bids: nextBids };
            if (!throttleTimeoutRef.current) {
              throttleTimeoutRef.current = setTimeout(() => {
                if (!disposed && pendingDataRef.current) {
                  setAsks(pendingDataRef.current.asks);
                  setBids(pendingDataRef.current.bids);
                  setWsConnected(true);
                  pendingDataRef.current = null;
                }
                throttleTimeoutRef.current = null;
              }, 250);
            }
          } catch {
            // Malformed frames cannot establish or extend freshness.
          }
        };
        connection.onerror = reconnect;
        connection.onclose = reconnect;
      } catch {
        reconnect();
      }
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(watchdog);
      if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
      pendingDataRef.current = null;
      close();
    };
  }, [symbol, accountType, marketType]);

  const rawAsks = asks;
  const rawBids = bids;

  const displayAsks = useMemo(() => {
    if (precision && precision > 0) {
      // Aggregate and take bottom N (closest to price)
      // aggregateOrders returns sorted ascending for asks
      const aggregated = aggregateOrders(rawAsks, precision, 'ask');
      // We want to show the lowest asks at the bottom of the list
      // So we take the first N (lowest prices) and reverse them
      return aggregated.slice(0, rowCount).reverse();
    }
    // If no precision, just take first N and reverse
    return rawAsks.slice(0, rowCount).reverse();
  }, [rawAsks, precision, rowCount]);

  const displayBids = useMemo(() => {
    if (precision && precision > 0) {
      // Aggregate and take top N (closest to price)
      // aggregateOrders returns sorted descending for bids
      const aggregated = aggregateOrders(rawBids, precision, 'bid');
      return aggregated.slice(0, rowCount);
    }
    return rawBids.slice(0, rowCount);
  }, [rawBids, precision, rowCount]);

  // Calculate decimal places based on current price or selected precision
  const priceDecimals = precision
    ? precision.toFixed(8).replace(/0+$/, '').split('.')[1]?.length || 0
    : calculatePriceDecimals(currentPrice);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startRows = rowCount;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // Approx 20px per row pair (ask+bid) change?
      // Actually each row is ~24px. Changing rowCount by 1 adds 1 ask AND 1 bid = 48px total height change.
      // Let's make it sensitive enough.
      const steps = Math.round(deltaY / 30);
      const newRows = Math.min(12, Math.max(7, startRows + steps));
      setRowCount(newRows);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="market-depth">
      <div className="depth-toolbar">
        <Select
          value={precision?.toString() || ""}
          onValueChange={(val) => setPrecision(parseFloat(val))}
          disabled={availablePrecisions.length === 0}
        >
          <SelectTrigger className="h-6 w-[90px] text-xs border-none bg-transparent focus:ring-0">
            <SelectValue placeholder="Tick" />
          </SelectTrigger>
          <SelectContent>
            {availablePrecisions.map((p) => (
              <SelectItem key={p} value={p.toString()} className="text-xs">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="depth-header">
        <span>Price</span>
        <span>Qty</span>
        <span>Total</span>
      </div>
      <div className="asks">
        {displayAsks.map((item, i) => (
          <button
            type="button"
            key={`ask-${i}`}
            className="depth-row ask"
            disabled={!wsConnected}
            onClick={() => selectPrice(item.price.toFixed(priceDecimals))}
          >
            <span className="price">{item.price.toFixed(priceDecimals)}</span>
            <span className="qty">{formatQuantity(item.quantity)}</span>
            <span className="total">{formatQuantity(item.total)}</span>
          </button>
        ))}
      </div>
      <div className="current-price-display">
        <span>{currentPrice > 0 ? formatPrice(currentPrice) : "—"}</span>
        {!wsConnected && <span role="status" className="text-xs ml-2 text-muted-foreground">
          {accountType !== "binance" ? "Depth unavailable" : "Waiting for live depth"}
        </span>}
      </div>
      <div className="bids">
        {displayBids.map((item, i) => (
          <button
            type="button"
            key={`bid-${i}`}
            className="depth-row bid"
            disabled={!wsConnected}
            onClick={() => selectPrice(item.price.toFixed(priceDecimals))}
          >
            <span className="price">{item.price.toFixed(priceDecimals)}</span>
            <span className="qty">{formatQuantity(item.quantity)}</span>
            <span className="total">{formatQuantity(item.total)}</span>
          </button>
        ))}
      </div>

      {/* Resize Handle */}
      <div
        className="resize-handle"
        onMouseDown={handleResizeMouseDown}
      >
        <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
      </div>

      <style>{`
        .market-depth {
          font-size: 0.8rem;
          width: 100%;
          display: flex;
          flex-direction: column;
          background: #fff;
          position: relative;
        }
        .dark .market-depth {
          background: #09090b;
        }
        .resize-handle {
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: ns-resize;
          border-top: 1px solid #e5e5e5;
          background: #f9fafb;
        }
        .resize-handle:hover {
          background: #f3f4f6;
        }
        .dark .resize-handle {
          border-top: 1px solid #27272a;
          background: #18181b;
        }
        .dark .resize-handle:hover {
          background: #27272a;
        }
        .depth-toolbar {
          display: flex;
          justify-content: flex-end;
          padding: 2px 4px;
          border-bottom: 1px solid #e5e5e5;
        }
        .dark .depth-toolbar {
          border-bottom: 1px solid #27272a;
        }
        .depth-header {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          padding: 8px;
          color: #666;
          font-weight: 600;
          border-bottom: 1px solid #e5e5e5;
          text-align: right;
        }
        .depth-header span:first-child {
          text-align: left;
        }
        .dark .depth-header {
          color: #a1a1aa;
          border-bottom: 1px solid #27272a;
        }
        .depth-row {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          padding: 4px 8px;
          cursor: pointer;
          text-align: right;
        }
        .depth-row span:first-child {
          text-align: left;
        }
        .depth-row:hover {
          background-color: rgba(0,0,0,0.05);
        }
        .dark .depth-row:hover {
          background-color: rgba(255,255,255,0.05);
        }
        .ask .price { color: #ef4444; }
        .bid .price { color: #22c55e; }
        .current-price-display {
          text-align: center;
          padding: 8px;
          font-weight: bold;
          border-top: 1px solid #e5e5e5;
          border-bottom: 1px solid #e5e5e5;
          background: rgba(0,0,0,0.02);
        }
        .dark .current-price-display {
          border-color: #27272a;
          background: rgba(255,255,255,0.02);
        }

        /* Mobile view */
        @media (max-width: 768px) {
          .market-depth {
            width: 100%;
            border-left: 1px solid #e5e5e5;
            border-top: none;
          }
          .dark .market-depth {
            border-left: 1px solid #27272a;
            border-top: none;
          }
        }
      `}</style>
    </div>
  );
});

// Never render levels from the previous symbol or market, even for one render.
export default function ScopedMarketDepth(props: MarketDepthProps) {
  return <MarketDepth key={`${props.accountType}:${props.marketType}:${props.symbol}`} {...props} />;
}
