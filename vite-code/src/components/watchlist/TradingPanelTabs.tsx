import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import {
  AlertTriangle,
  Clock,
  Package,
  RefreshCw,
  Receipt,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useState, useRef } from "react";

// Global promise cache to deduplicate simultaneous fetches
const TABS_DATA_CACHE = new Map<string, Promise<any>>();

interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: "binance" | "kite" | "upstox";
  isActive: boolean;
}

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  pnlPercentage: number;
  side: "LONG" | "SHORT";
  leverage?: number;
  liquidationPrice?: number;
  breakEvenPrice?: number;
  margin?: number;
  marginType?: string;
}

interface Order {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  orderType: string;
  side: string;
  status: string;
  filledQuantity: number;
  timestamp: string;
}

interface Trade {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  side: string;
  realizedPnl: number;
  commission: number;
  timestamp: number;
}

interface OrderHistory {
  id: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  executedQty: number;
  price: number;
  avgPrice: number;
  status: string;
  time: number;
}

interface TradingPanelTabsProps {
  selectedAccount?: TradingAccount | null;
  symbol?: string;
  onSymbolSelect?: (symbol: string) => void;
  refreshTrigger?: number;
  orderBookPrice?: string | null;
  onOrderBookPriceApplied?: () => void;
}

const TradingPanelTabs = memo(function TradingPanelTabs({
  selectedAccount,
  symbol,
  onSymbolSelect,
  refreshTrigger,
  orderBookPrice,
  onOrderBookPriceApplied,
}: TradingPanelTabsProps) {
  const [activeTab, setActiveTab] = useState("positions");
  const [historySubTab, setHistorySubTab] = useState<"orders" | "trades">("orders");
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for close position inputs per symbol
  const [closeInputs, setCloseInputs] = useState<Record<string, { price: string; quantity: string }>>({});
  const [activeQuantityInput, setActiveQuantityInput] = useState<string | null>(null);
  const [activePriceInput, setActivePriceInput] = useState<string | null>(null);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  
  // Refs for price inputs to refocus after order book price is applied
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    if (!selectedAccount) return;

    setLoading(true);
    setError(null);

    try {
      const cacheKey = `${selectedAccount._id}-${activeTab}-${symbol || ''}`;
      let promise = TABS_DATA_CACHE.get(cacheKey);

      if (!promise) {
        promise = (async () => {
          try {
            // Fetch based on active tab
            if (activeTab === "positions") {
              const response = await api.get(
                `/positions?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`
              );
              return { type: 'positions', data: response.data };
            } else if (activeTab === "orders") {
              const response = await api.get(
                `/orders?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`
              );
              return { type: 'orders', data: response.data };
            } else if (activeTab === "history") {
              // Fetch both order history and trade history
              const symbolQuery = symbol ? `&symbol=${encodeURIComponent(symbol)}` : "";
              const [orderRes, tradeRes] = await Promise.all([
                api.get(
                  `/binance/order-history?accountId=${selectedAccount._id}${symbolQuery}&limit=30`
                ),
                api.get(
                  `/binance/trade-history?accountId=${selectedAccount._id}${symbolQuery}&limit=30`
                ),
              ]);
              return { type: 'history', orderData: orderRes.data, tradeData: tradeRes.data };
            }
          } finally {
            // Clear cache after 2 seconds
            setTimeout(() => {
              TABS_DATA_CACHE.delete(cacheKey);
            }, 2000);
          }
        })();
        TABS_DATA_CACHE.set(cacheKey, promise);
      }

      const result = await promise;

      if (activeTab === "positions" && result?.type === 'positions') {
        if (result.data?.success) {
          const posData =
            result.data.data ||
            result.data.positions ||
            [];
          // Filter to only show positions with non-zero quantity
          setPositions(
            posData
              .filter((p: any) => Math.abs(p.quantity) > 0)
              .map((p: any) => ({
                id: p.id || p.symbol,
                symbol: p.symbol,
                quantity: Math.abs(p.quantity),
                averagePrice: p.averagePrice || p.entryPrice,
                lastPrice: p.lastPrice || p.markPrice,
                pnl: p.pnl || p.unrealizedPnl || 0,
                pnlPercentage: p.pnlPercentage || 0,
                side: p.quantity > 0 ? "LONG" : "SHORT",
                leverage: p.leverage,
                liquidationPrice: p.liquidationPrice,
                breakEvenPrice: p.breakEvenPrice,
                margin: p.margin,
                marginType: p.marginType,
              }))
          );
        }
      } else if (activeTab === "orders" && result?.type === 'orders') {
        if (result.data?.success) {
          // Filter to only open orders - check both 'orders' and 'data' arrays
          const ordersArray = result.data.orders || result.data.data || [];
          setOrders(
            ordersArray
              .filter((o: any) => o.status === "NEW" || o.status === "PARTIALLY_FILLED")
              .map((o: any) => ({
                id: o.id || o.orderId,
                symbol: o.symbol,
                quantity: o.quantity || o.origQty,
                price: o.price,
                orderType: o.orderType || o.type,
                side: o.transactionType || o.side,
                status: o.status,
                filledQuantity: o.filledQuantity || o.executedQty || 0,
                timestamp: o.timestamp || o.time,
              }))
          );
        }
      } else if (activeTab === "history" && result?.type === 'history') {
        if (result.orderData?.success) {
          setOrderHistory(
            (result.orderData.orders || []).map((o: Record<string, unknown>) => ({
              id: o.id,
              symbol: o.symbol,
              side: o.side,
              type: o.type,
              quantity: o.quantity,
              executedQty: o.executedQty,
              price: o.price,
              avgPrice: o.avgPrice,
              status: o.status,
              time: o.time,
            }))
          );
        }

        if (result.tradeData?.success) {
          setTrades(
            (result.tradeData.trades || []).slice(0, 30).map((t: Record<string, unknown>) => ({
              id: t.id,
              symbol: t.symbol,
              quantity: t.qty,
              price: t.price,
              side: t.side,
              realizedPnl: t.realizedPnl || 0,
              commission: t.commission || 0,
              timestamp: t.time,
            }))
          );
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch data";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, activeTab, symbol]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleCancelOrder = async (orderId: string, orderSymbol: string) => {
    if (!selectedAccount) return;

    try {
      await api.delete(`/orders/${orderId}`, {
        data: {
          accountId: selectedAccount._id,
          symbol: orderSymbol,
        },
      });
      fetchData();
    } catch (err) {
      console.error("Failed to cancel order:", err);
    }
  };

  const formatPrice = (price: number | string) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (!numPrice || numPrice === 0 || isNaN(numPrice)) return "0";
    const absPrice = Math.abs(numPrice);
    
    // Dynamic decimal places based on price magnitude
    // This approximates tick size behavior for most trading pairs
    if (absPrice >= 10000) return numPrice.toFixed(1);      // BTC: 0.1
    if (absPrice >= 1000) return numPrice.toFixed(2);       // ETH, etc: 0.01
    if (absPrice >= 100) return numPrice.toFixed(2);        // Mid-range: 0.01
    if (absPrice >= 10) return numPrice.toFixed(3);         // Lower: 0.001
    if (absPrice >= 1) return numPrice.toFixed(4);          // Sub-dollar: 0.0001
    if (absPrice >= 0.1) return numPrice.toFixed(5);        // Very low: 0.00001
    if (absPrice >= 0.01) return numPrice.toFixed(6);       // Micro: 0.000001
    if (absPrice >= 0.001) return numPrice.toFixed(7);      // Sub-micro: 0.0000001
    return numPrice.toFixed(8);                              // Nano-cap: 0.00000001
  };

  const getTickSize = (price: number | string) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (!numPrice || numPrice === 0 || isNaN(numPrice)) return "1";
    const absPrice = Math.abs(numPrice);
    
    // Return tick size based on price magnitude (matches formatPrice decimals)
    if (absPrice >= 10000) return "0.1";
    if (absPrice >= 1000) return "0.01";
    if (absPrice >= 100) return "0.01";
    if (absPrice >= 10) return "0.001";
    if (absPrice >= 1) return "0.0001";
    if (absPrice >= 0.1) return "0.00001";
    if (absPrice >= 0.01) return "0.000001";
    if (absPrice >= 0.001) return "0.0000001";
    return "0.00000001";
  };

  const formatTime = (timestamp: string | number) => {
    const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Initialize close inputs when positions change
  useEffect(() => {
    const newInputs: Record<string, { price: string; quantity: string }> = {};
    positions.forEach((pos) => {
      if (!closeInputs[pos.symbol]) {
        newInputs[pos.symbol] = {
          price: formatPrice(pos.lastPrice),
          quantity: String(pos.quantity),
        };
      } else {
        newInputs[pos.symbol] = closeInputs[pos.symbol];
      }
    });
    if (Object.keys(newInputs).length > 0) {
      setCloseInputs((prev) => ({ ...prev, ...newInputs }));
    }
  }, [positions]);

  // Apply order book price to active price input
  useEffect(() => {
    if (orderBookPrice && activePriceInput) {
      const symbolToUpdate = activePriceInput;
      setCloseInputs((prev) => ({
        ...prev,
        [symbolToUpdate]: {
          ...prev[symbolToUpdate],
          price: orderBookPrice,
        },
      }));
      // Refocus the input after a short delay
      setTimeout(() => {
        priceInputRefs.current[symbolToUpdate]?.focus();
      }, 10);
      onOrderBookPriceApplied?.();
    }
  }, [orderBookPrice, activePriceInput, onOrderBookPriceApplied]);

  const handleCloseInputChange = (symbol: string, field: 'price' | 'quantity', value: string) => {
    setCloseInputs((prev) => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        [field]: value,
      },
    }));
  };

  const handleQuantityPercentage = (symbol: string, percentage: number) => {
    const position = positions.find((p) => p.symbol === symbol);
    if (!position) return;
    
    const quantityValue = Math.floor(position.quantity * (percentage / 100) * 1000) / 1000; // Round down to 3 decimals
    setCloseInputs((prev) => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        quantity: String(quantityValue),
      },
    }));
    setActiveQuantityInput(null);
  };

  const handleClosePosition = async (posSymbol: string, orderType: 'MARKET' | 'LIMIT') => {
    if (!selectedAccount) return;
    
    const position = positions.find((p) => p.symbol === posSymbol);
    if (!position) return;
    
    const inputs = closeInputs[posSymbol];
    if (!inputs) return;
    
    const quantity = parseFloat(inputs.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }
    
    if (orderType === 'LIMIT') {
      const price = parseFloat(inputs.price);
      if (isNaN(price) || price <= 0) {
        alert('Please enter a valid price for limit order');
        return;
      }
    }
    
    const confirmMsg = orderType === 'MARKET'
      ? `Close ${quantity} ${posSymbol} at MARKET price?`
      : `Close ${quantity} ${posSymbol} at LIMIT price ${inputs.price}?`;
    
    if (!confirm(confirmMsg)) return;
    
    setClosingPosition(posSymbol);
    
    try {
      // Close position = opposite side order
      const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
      
      const orderData: any = {
        accountId: selectedAccount._id,
        symbol: posSymbol,
        side: closeSide,
        type: orderType,
        quantity: quantity,
        reduceOnly: true,
      };
      
      if (orderType === 'LIMIT') {
        orderData.price = parseFloat(inputs.price);
      }
      
      await api.post('/orders/place', orderData);
      
      // Refresh positions
      fetchData();
    } catch (err: any) {
      console.error('Failed to close position:', err);
      alert(err.response?.data?.error || err.message || 'Failed to close position');
    } finally {
      setClosingPosition(null);
    }
  };

  const handleCloseAllPositions = async () => {
    if (!selectedAccount || positions.length === 0) return;
    
    const confirmMsg = `Close ALL ${positions.length} positions at MARKET price? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;
    
    setClosingPosition('all');
    
    try {
      // Close all positions sequentially
      for (const position of positions) {
        const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
        
        await api.post('/orders/place', {
          accountId: selectedAccount._id,
          symbol: position.symbol,
          side: closeSide,
          type: 'MARKET',
          quantity: position.quantity,
          reduceOnly: true,
        });
      }
      
      // Refresh positions
      fetchData();
    } catch (err: any) {
      console.error('Failed to close all positions:', err);
      alert(err.response?.data?.error || err.message || 'Failed to close all positions');
    } finally {
      setClosingPosition(null);
    }
  };

  return (
    <div className="w-full bg-card rounded-md border shadow-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between px-2 border-b">
          <TabsList className="h-12 bg-transparent p-0 rounded-none">
            <TabsTrigger
              value="positions"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 text-base"
            >
              <Package className="w-5 h-5 mr-2" />
              Positions ({positions.length})
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 text-base"
            >
              <Receipt className="w-5 h-5 mr-2" />
              Orders ({orders.length})
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 text-base"
            >
              <Clock className="w-5 h-5 mr-2" />
              History
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Positions Tab */}
        <TabsContent value="positions" className="m-0 p-0">
          <div className="h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-4 text-base text-destructive">
                <AlertTriangle className="w-5 h-5 mr-1" /> {error}
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center py-4 text-base text-muted-foreground">
                No open positions
              </div>
            ) : (
              <table className="w-full text-base mb-24">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Symbol</th>
                    <th className="text-right px-2 py-2 font-medium">Size</th>
                    <th className="text-right px-2 py-2 font-medium">Entry</th>
                    <th className="text-right px-2 py-2 font-medium">B/E</th>
                    <th className="text-right px-2 py-2 font-medium">Liq</th>
                    <th className="text-right px-2 py-2 font-medium">Margin</th>
                    <th className="text-right px-2 py-2 font-medium">PNL</th>
                    <th className="text-center px-2 py-2 font-medium min-w-[160px]">Price / Qty</th>
                    <th className="text-center px-2 py-2 font-medium">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-sm px-3 shadow-sm hover:brightness-110 transition-all"
                        onClick={handleCloseAllPositions}
                        disabled={closingPosition !== null}
                      >
                        {closingPosition === 'all' ? '...' : 'Close All'}
                      </Button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="px-2 py-2 cursor-pointer" onClick={() => onSymbolSelect?.(pos.symbol)}>
                        <div className="flex items-center gap-1">
                          {pos.side === "LONG" ? (
                            <TrendingUp className="w-5 h-5 text-green-500" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-red-500" />
                          )}
                          <span className="font-medium">{pos.symbol}</span>
                          {pos.leverage && (
                            <Badge variant="neutral" className="text-sm px-1.5 py-0.5">
                              {pos.leverage}x
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-right px-2 py-2">{pos.quantity}</td>
                      <td className="text-right px-2 py-2">{formatPrice(pos.averagePrice)}</td>
                      <td className="text-right px-2 py-2 text-muted-foreground">
                        {pos.breakEvenPrice ? formatPrice(pos.breakEvenPrice) : "-"}
                      </td>
                      <td className="text-right px-2 py-2 text-orange-500">
                        {pos.liquidationPrice ? formatPrice(pos.liquidationPrice) : "-"}
                      </td>
                      <td className="text-right px-2 py-2">
                        {pos.margin ? `$${pos.margin.toFixed(2)}` : "-"}
                      </td>
                      <td
                        className={`text-right px-2 py-2 font-medium ${
                          pos.pnl >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        ${pos.pnl.toFixed(2)}
                      </td>
                      <td className="px-1 py-2">
                        <div className="relative flex gap-1">
                          <input
                            ref={(el) => { priceInputRefs.current[pos.symbol] = el; }}
                            type="number"
                            value={closeInputs[pos.symbol]?.price || ''}
                            onChange={(e) => handleCloseInputChange(pos.symbol, 'price', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setActivePriceInput(pos.symbol)}
                            onBlur={() => setTimeout(() => setActivePriceInput(null), 200)}
                            className="w-48 h-8 text-sm px-2 border rounded bg-background text-right focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Price"
                            step={getTickSize(pos.lastPrice)}
                          />
                          <input
                            type="number"
                            value={closeInputs[pos.symbol]?.quantity || ''}
                            onChange={(e) => handleCloseInputChange(pos.symbol, 'quantity', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setActiveQuantityInput(pos.symbol)}
                            onBlur={() => setTimeout(() => setActiveQuantityInput(null), 200)}
                            className="w-40 h-8 text-sm px-2 border rounded bg-background text-right focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Qty"
                            step="any"
                          />
                          {activeQuantityInput === pos.symbol && (
                            <div className="absolute top-full right-0 mt-1 z-50 flex gap-0.5 bg-popover border rounded-md shadow-lg p-1 animate-in fade-in zoom-in-95 duration-100">
                              {[0, 25, 50, 75, 100].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  className="px-2 py-1 text-sm font-medium bg-muted hover:bg-primary hover:text-primary-foreground rounded transition-colors"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleQuantityPercentage(pos.symbol, pct);
                                  }}
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-2">
                        <div className="flex gap-1 justify-center">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 text-sm px-3 shadow-sm hover:brightness-110 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClosePosition(pos.symbol, 'MARKET');
                            }}
                            disabled={closingPosition !== null}
                          >
                            {closingPosition === pos.symbol ? '...' : 'Mkt'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-sm px-3 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white shadow-sm transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClosePosition(pos.symbol, 'LIMIT');
                            }}
                            disabled={closingPosition !== null}
                          >
                            Lmt
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="m-0 p-0">
          <div className="h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-4 text-base text-destructive">
                <AlertTriangle className="w-5 h-5 mr-1" /> {error}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-4 text-base text-muted-foreground">
                No open orders
              </div>
            ) : (
              <table className="w-full text-base">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Symbol</th>
                    <th className="text-right px-2 py-2 font-medium">Type</th>
                    <th className="text-right px-2 py-2 font-medium">Side</th>
                    <th className="text-right px-2 py-2 font-medium">Price</th>
                    <th className="text-right px-2 py-2 font-medium">Qty</th>
                    <th className="text-center px-2 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-2">
                        <span
                          className="font-medium cursor-pointer hover:text-primary"
                          onClick={() => onSymbolSelect?.(order.symbol)}
                        >
                          {order.symbol}
                        </span>
                      </td>
                      <td className="text-right px-2 py-2">{order.orderType}</td>
                      <td
                        className={`text-right px-2 py-2 ${
                          order.side === "BUY" ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {order.side}
                      </td>
                      <td className="text-right px-2 py-2">{formatPrice(order.price)}</td>
                      <td className="text-right px-2 py-2">
                        {order.filledQuantity}/{order.quantity}
                      </td>
                      <td className="text-center px-2 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleCancelOrder(order.id, order.symbol)}
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="m-0 p-0">
          {/* Sub-tabs for Orders vs Trades */}
          <div className="flex border-b px-2 gap-2 text-base">
            <button
              className={`py-2 px-2 ${historySubTab === "orders" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setHistorySubTab("orders")}
            >
              Order History ({orderHistory.length})
            </button>
            <button
              className={`py-2 px-2 ${historySubTab === "trades" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setHistorySubTab("trades")}
            >
              Trades ({trades.length})
            </button>
          </div>
          <div className="h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-4 text-base text-destructive">
                <AlertTriangle className="w-5 h-5 mr-1" /> {error}
              </div>
            ) : historySubTab === "orders" ? (
              orderHistory.length === 0 ? (
                <div className="text-center py-4 text-base text-muted-foreground">
                  No order history
                </div>
              ) : (
                <table className="w-full text-base">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium">Time</th>
                      <th className="text-left px-2 py-2 font-medium">Symbol</th>
                      <th className="text-right px-2 py-2 font-medium">Side</th>
                      <th className="text-right px-2 py-2 font-medium">Type</th>
                      <th className="text-right px-2 py-2 font-medium">Filled</th>
                      <th className="text-right px-2 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map((order) => (
                      <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-2 py-2 text-muted-foreground">
                          {formatTime(order.time)}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className="font-medium cursor-pointer hover:text-primary"
                            onClick={() => onSymbolSelect?.(order.symbol)}
                          >
                            {order.symbol}
                          </span>
                        </td>
                        <td
                          className={`text-right px-2 py-2 ${
                            order.side === "BUY" ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {order.side}
                        </td>
                        <td className="text-right px-2 py-2">{order.type}</td>
                        <td className="text-right px-2 py-2">
                          {order.executedQty}/{order.quantity}
                        </td>
                        <td className="text-right px-2 py-2">
                          <Badge
                            variant={order.status === "FILLED" ? "success" : order.status === "CANCELED" ? "danger" : "neutral"}
                            className="text-sm px-1.5 py-0.5"
                          >
                            {order.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : trades.length === 0 ? (
              <div className="text-center py-4 text-base text-muted-foreground">
                No trade history
              </div>
            ) : (
              <table className="w-full text-base">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Time</th>
                    <th className="text-left px-2 py-2 font-medium">Symbol</th>
                    <th className="text-right px-2 py-2 font-medium">Side</th>
                    <th className="text-right px-2 py-2 font-medium">Price</th>
                    <th className="text-right px-2 py-2 font-medium">Qty</th>
                    <th className="text-right px-2 py-2 font-medium">PNL</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-2 text-muted-foreground">
                        {formatTime(trade.timestamp)}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="font-medium cursor-pointer hover:text-primary"
                          onClick={() => onSymbolSelect?.(trade.symbol)}
                        >
                          {trade.symbol}
                        </span>
                      </td>
                      <td
                        className={`text-right px-2 py-2 ${
                          trade.side === "BUY" ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {trade.side}
                      </td>
                      <td className="text-right px-2 py-2">{formatPrice(trade.price)}</td>
                      <td className="text-right px-2 py-2">{trade.quantity}</td>
                      <td
                        className={`text-right px-2 py-2 font-medium ${
                          trade.realizedPnl >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {trade.realizedPnl !== 0 ? `$${trade.realizedPnl.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
});

export default TradingPanelTabs;
