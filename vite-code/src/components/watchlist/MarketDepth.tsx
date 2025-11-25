import { memo, useEffect, useState } from "react";
import { formatPrice, formatQuantity, calculatePriceDecimals } from "@/lib/format-utils";

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

  useEffect(() => {
    if (!symbol || accountType !== "binance") return;

    // Use Binance WebSocket for real-time order book updates
    const isFutures = marketType === "binance-futures";
    const wsBaseUrl = isFutures
      ? "wss://fstream.binance.com/ws"
      : "wss://stream.binance.com:9443/ws";
    const streamName = `${symbol.toLowerCase()}@depth5@100ms`;

    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      ws = new WebSocket(`${wsBaseUrl}/${streamName}`);

      ws.onopen = () => {
        console.log(`Order book WebSocket connected for ${symbol}`);
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Binance depth stream format: { bids: [[price, qty], ...], asks: [[price, qty], ...] }
          if (data.bids && data.asks) {
            const newAsks: OrderBookItem[] = data.asks
              .slice(0, 5)
              .reverse()
              .map(([price, qty]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty),
                total: parseFloat(price) * parseFloat(qty),
              }));

            const newBids: OrderBookItem[] = data.bids
              .slice(0, 5)
              .map(([price, qty]: [string, string]) => ({
                price: parseFloat(price),
                quantity: parseFloat(qty),
                total: parseFloat(price) * parseFloat(qty),
              }));

            setAsks(newAsks);
            setBids(newBids);
          }
        } catch (err) {
          console.error("Error parsing order book data:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("Order book WebSocket error:", error);
        setWsConnected(false);
      };

      ws.onclose = () => {
        console.log("Order book WebSocket closed");
        setWsConnected(false);
      };
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [symbol, accountType, marketType]);

  // Fallback to mock data if no real data
  const displayAsks =
    asks.length > 0
      ? asks
      : Array.from({ length: 5 }).map((_, i) => ({
          price: currentPrice + (5 - i) * (currentPrice * 0.0001),
          quantity: Math.random() * 10,
          total: Math.random() * 1000,
        }));

  const displayBids =
    bids.length > 0
      ? bids
      : Array.from({ length: 5 }).map((_, i) => ({
          price: currentPrice - (i + 1) * (currentPrice * 0.0001),
          quantity: Math.random() * 10,
          total: Math.random() * 1000,
        }));

  // Calculate decimal places based on current price
  const priceDecimals = calculatePriceDecimals(currentPrice);

  return (
    <div className="market-depth">
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
      <style>{`
        .market-depth {
          font-size: 0.8rem;
          width: 250px;
          border-left: 1px solid #e5e5e5;
          display: flex;
          flex-direction: column;
          background: #fff;
        }
        .dark .market-depth {
          border-left: 1px solid #27272a;
          background: #09090b;
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
