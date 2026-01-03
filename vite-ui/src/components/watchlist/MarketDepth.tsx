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
  accountType?: "binance" | "kite" | "upstox";
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
    const factor = Math.round(1 / tickSize);
    // Use a small epsilon for float stability before flooring
    const priceKey = Math.floor(order.price * factor + 0.0000001) / factor;
    
    // Normalize to avoid 0.30000000004
    // Count decimals in tickSize, but cap at 8 to avoid toFixed() errors
    const decimals = Math.min(8, Math.max(0, Math.round(-Math.log10(tickSize))));
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
  const [precision, setPrecision] = useState<number | null>(null);
  const [availablePrecisions, setAvailablePrecisions] = useState<number[]>([]);
  const [lastSymbol, setLastSymbol] = useState<string>("");
  const [rowCount, setRowCount] = useState(7);

  // Throttle state updates to reduce re-renders
  const throttleTimeoutRef = useRef<number | null>(null);
  const pendingDataRef = useRef<{ asks: OrderBookItem[], bids: OrderBookItem[] } | null>(null);

  // Reset precision when symbol changes
  useEffect(() => {
    if (symbol !== lastSymbol) {
      setPrecision(null);
      setLastSymbol(symbol);
    }
  }, [symbol, lastSymbol]);

  // Calculate available precisions from actual order book data
  useEffect(() => {
    // Combine all prices from asks and bids
    const allPrices = [...asks, ...bids].map(item => item.price).filter(p => p > 0);
    
    if (allPrices.length < 2) {
      // Fallback: use current price to determine decimals
      if (currentPrice > 0) {
        const priceStr = currentPrice.toString();
        const decimals = Math.min(8, priceStr.includes('.') ? priceStr.split('.')[1].length : 0);
        const steps: number[] = [];
        for (let i = 0; i < 5; i++) {
          const decimalPlaces = Math.min(8, Math.max(0, decimals - i));
          const p = Math.pow(10, -(decimals - i));
          if (p > currentPrice) break;
          steps.push(parseFloat(p.toFixed(decimalPlaces)));
        }
        if (steps.length > 0) {
          setAvailablePrecisions(steps);
          if (precision === null) {
            setPrecision(steps[0]);
          }
        }
      }
      return;
    }

    // Find the minimum price difference (tick size) in the order book
    allPrices.sort((a, b) => a - b);
    let minDiff = Infinity;
    for (let i = 1; i < allPrices.length; i++) {
      const diff = allPrices[i] - allPrices[i - 1];
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
      }
    }

    if (minDiff !== Infinity && minDiff > 0) {
      // Determine number of decimals in the tick size
      const tickStr = minDiff.toFixed(10);
      const tickDecimals = Math.min(8, tickStr.includes('.') ? tickStr.replace(/0+$/, '').split('.')[1]?.length || 0 : 0);
      
      // Generate precision steps starting from minDiff
      const steps: number[] = [];
      const baseTickSize = parseFloat(minDiff.toFixed(Math.min(8, tickDecimals)));
      
      // Add base tick and multiples (1x, 10x, 100x, 1000x, 10000x)
      for (let i = 0; i < 5; i++) {
        const step = baseTickSize * Math.pow(10, i);
        if (step > currentPrice) break;
        const decimalPlaces = Math.min(8, Math.max(0, tickDecimals - i));
        steps.push(parseFloat(step.toFixed(decimalPlaces)));
      }

      if (steps.length > 0) {
        setAvailablePrecisions(steps);
        // Only set initial precision if not already set
        if (precision === null) {
          setPrecision(steps[0]);
        }
      }
    }
    // Note: precision is intentionally excluded from deps to avoid loops
    // We only want to set it once when initially null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asks, bids, currentPrice, symbol]);

  useEffect(() => {
    if (!symbol || accountType !== "binance") return;

    // Use Binance WebSocket for real-time order book updates
    const isFutures = marketType === "binance-futures";
    const wsBaseUrl = isFutures
      ? "wss://fstream.binance.com/ws"
      : "wss://stream.binance.com:9443/ws";
    // Fetch more depth to allow for aggregation
    const streamName = `${symbol.toLowerCase()}@depth20@100ms`;

    let ws: WebSocket | null = null;
    let isCleanedUp = false;

    const connectWebSocket = () => {
      // Prevent connection if already cleaned up
      if (isCleanedUp) return;

      ws = new WebSocket(`${wsBaseUrl}/${streamName}`);

      ws.onopen = () => {
        if (isCleanedUp) {
          ws?.close();
          return;
        }
        console.log(`Order book WebSocket connected for ${symbol}`);
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (isCleanedUp) return;
        
        try {
          const data = JSON.parse(event.data);
          // Binance depth stream format: { bids: [[price, qty], ...], asks: [[price, qty], ...] }
          if (data.bids && data.asks) {
            const newAsks: OrderBookItem[] = data.asks
              .map(([price, qty]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty),
                total: parseFloat(price) * parseFloat(qty),
              }));

            const newBids: OrderBookItem[] = data.bids
              .map(([price, qty]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty),
                total: parseFloat(price) * parseFloat(qty),
              }));

            // Store pending data
            pendingDataRef.current = { asks: newAsks, bids: newBids };

            // Throttle updates to once per second
            if (!throttleTimeoutRef.current) {
              throttleTimeoutRef.current = setTimeout(() => {
                if (pendingDataRef.current && !isCleanedUp) {
                  setAsks(pendingDataRef.current.asks);
                  setBids(pendingDataRef.current.bids);
                  pendingDataRef.current = null;
                }
                throttleTimeoutRef.current = null;
              }, 1000);
            }
          }
        } catch (err) {
          console.error("Error parsing order book data:", err);
        }
      };

      ws.onerror = () => {
        if (isCleanedUp) return;
        // Only log error if we haven't closed explicitly
        if (ws?.readyState !== WebSocket.CLOSED && ws?.readyState !== WebSocket.CLOSING) {
          // Suppress connection errors during unmount/remount cycles
          // console.warn(`Order book WebSocket error for ${symbol}:`, error);
        }
        setWsConnected(false);
      };

      ws.onclose = () => {
        if (isCleanedUp) return;
        setWsConnected(false);
      };
    };

    connectWebSocket();

    return () => {
      isCleanedUp = true;
      
      // Clear throttle timeout
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      pendingDataRef.current = null;
      
      if (ws) {
        ws.onclose = null; // Prevent onclose trigger during cleanup
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
      }
    };
  }, [symbol, accountType, marketType]);

  // Fallback to mock data if no real data
  const rawAsks =
    asks.length > 0
      ? asks
      : Array.from({ length: 20 }).map((_, i) => ({
          price: currentPrice + (20 - i) * (currentPrice * 0.0001),
          quantity: Math.random() * 10,
          total: Math.random() * 1000,
        }));

  const rawBids =
    bids.length > 0
      ? bids
      : Array.from({ length: 20 }).map((_, i) => ({
          price: currentPrice - (i + 1) * (currentPrice * 0.0001),
          quantity: Math.random() * 10,
          total: Math.random() * 1000,
        }));

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
    ? Math.max(0, Math.round(-Math.log10(precision)))
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
          <div
            key={`ask-${i}`}
            className="depth-row ask"
            onClick={() => onPriceSelect(item.price.toFixed(priceDecimals))}
          >
            <span className="price">{item.price.toFixed(priceDecimals)}</span>
            <span className="qty">{formatQuantity(item.quantity)}</span>
            <span className="total">{formatQuantity(item.total)}</span>
          </div>
        ))}
      </div>
      <div className="current-price-display">
        <span>{formatPrice(currentPrice)}</span>
        {!wsConnected && <span className="text-xs ml-2 text-muted-foreground">(mock)</span>}
      </div>
      <div className="bids">
        {displayBids.map((item, i) => (
          <div
            key={`bid-${i}`}
            className="depth-row bid"
            onClick={() => onPriceSelect(item.price.toFixed(priceDecimals))}
          >
            <span className="price">{item.price.toFixed(priceDecimals)}</span>
            <span className="qty">{formatQuantity(item.quantity)}</span>
            <span className="total">{formatQuantity(item.total)}</span>
          </div>
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
            border-left: none;
            border-top: 1px solid #e5e5e5;
          }
          .dark .market-depth {
            border-top: 1px solid #27272a;
          }
        }
      `}</style>
    </div>
  );
});

export default MarketDepth;
