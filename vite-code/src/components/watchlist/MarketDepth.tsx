import { memo } from "react";

interface MarketDepthProps {
  symbol: string;
  currentPrice: number;
  onPriceSelect: (price: string) => void;
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
}: MarketDepthProps) {
  // Mock data for demonstration - in a real app this would come from WebSocket
  const asks: OrderBookItem[] = Array.from({ length: 5 }).map((_, i) => ({
    price: currentPrice + (5 - i) * (currentPrice * 0.0001),
    quantity: Math.random() * 10,
    total: Math.random() * 1000,
  }));

  const bids: OrderBookItem[] = Array.from({ length: 5 }).map((_, i) => ({
    price: currentPrice - (i + 1) * (currentPrice * 0.0001),
    quantity: Math.random() * 10,
    total: Math.random() * 1000,
  }));

  return (
    <div className="market-depth">
      <div className="depth-header">
        <span>Price</span>
        <span>Qty</span>
        <span>Total</span>
      </div>
      <div className="asks">
        {asks.map((item, i) => (
          <div
            key={`ask-${i}`}
            className="depth-row ask"
            onClick={() => onPriceSelect(item.price.toFixed(2))}
          >
            <span className="price">{item.price.toFixed(2)}</span>
            <span className="qty">{item.quantity.toFixed(4)}</span>
            <span className="total">{item.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="current-price-display">
        <span>{currentPrice.toFixed(2)}</span>
      </div>
      <div className="bids">
        {bids.map((item, i) => (
          <div
            key={`bid-${i}`}
            className="depth-row bid"
            onClick={() => onPriceSelect(item.price.toFixed(2))}
          >
            <span className="price">{item.price.toFixed(2)}</span>
            <span className="qty">{item.quantity.toFixed(4)}</span>
            <span className="total">{item.total.toFixed(2)}</span>
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
