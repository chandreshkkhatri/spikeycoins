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
import { memo, useCallback, useEffect, useState } from "react";

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
}

const TradingPanelTabs = memo(function TradingPanelTabs({
  selectedAccount,
  symbol,
  onSymbolSelect,
  refreshTrigger,
}: TradingPanelTabsProps) {
  const [activeTab, setActiveTab] = useState("positions");
  const [historySubTab, setHistorySubTab] = useState<"orders" | "trades">("orders");
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                marginType: p.marginType,
              }))
          );
        }
      } else if (activeTab === "orders" && result?.type === 'orders') {
        if (result.data?.success) {
          // Filter to only open orders
          setOrders(
            (result.data.orders || [])
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

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(1);
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const formatTime = (timestamp: string | number) => {
    const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="w-full bg-card rounded-md border shadow-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between px-2 border-b">
          <TabsList className="h-9 bg-transparent p-0 rounded-none">
            <TabsTrigger
              value="positions"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 py-2 text-xs"
            >
              <Package className="w-3 h-3 mr-1" />
              Positions ({positions.length})
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 py-2 text-xs"
            >
              <Receipt className="w-3 h-3 mr-1" />
              Orders ({orders.length})
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-3 py-2 text-xs"
            >
              <Clock className="w-3 h-3 mr-1" />
              History
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Positions Tab */}
        <TabsContent value="positions" className="m-0 p-0">
          <div className="max-h-[200px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-4 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 mr-1" /> {error}
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                No open positions
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
                    <th className="text-right px-2 py-1.5 font-medium">Size</th>
                    <th className="text-right px-2 py-1.5 font-medium">Entry</th>
                    <th className="text-right px-2 py-1.5 font-medium">Mark</th>
                    <th className="text-right px-2 py-1.5 font-medium">PNL</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => onSymbolSelect?.(pos.symbol)}
                    >
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          {pos.side === "LONG" ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className="font-medium">{pos.symbol}</span>
                          {pos.leverage && (
                            <Badge variant="neutral" className="text-[10px] px-1 py-0">
                              {pos.leverage}x
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-right px-2 py-1.5">{pos.quantity}</td>
                      <td className="text-right px-2 py-1.5">{formatPrice(pos.averagePrice)}</td>
                      <td className="text-right px-2 py-1.5">{formatPrice(pos.lastPrice)}</td>
                      <td
                        className={`text-right px-2 py-1.5 font-medium ${
                          pos.pnl >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        ${pos.pnl.toFixed(2)}
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
          <div className="max-h-[200px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-4 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 mr-1" /> {error}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                No open orders
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
                    <th className="text-right px-2 py-1.5 font-medium">Type</th>
                    <th className="text-right px-2 py-1.5 font-medium">Side</th>
                    <th className="text-right px-2 py-1.5 font-medium">Price</th>
                    <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                    <th className="text-center px-2 py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-1.5">
                        <span
                          className="font-medium cursor-pointer hover:text-primary"
                          onClick={() => onSymbolSelect?.(order.symbol)}
                        >
                          {order.symbol}
                        </span>
                      </td>
                      <td className="text-right px-2 py-1.5">{order.orderType}</td>
                      <td
                        className={`text-right px-2 py-1.5 ${
                          order.side === "BUY" ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {order.side}
                      </td>
                      <td className="text-right px-2 py-1.5">{formatPrice(order.price)}</td>
                      <td className="text-right px-2 py-1.5">
                        {order.filledQuantity}/{order.quantity}
                      </td>
                      <td className="text-center px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-destructive"
                          onClick={() => handleCancelOrder(order.id, order.symbol)}
                        >
                          <X className="w-3 h-3" />
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
          <div className="flex border-b px-2 gap-2 text-xs">
            <button
              className={`py-1.5 px-2 ${historySubTab === "orders" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setHistorySubTab("orders")}
            >
              Order History ({orderHistory.length})
            </button>
            <button
              className={`py-1.5 px-2 ${historySubTab === "trades" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setHistorySubTab("trades")}
            >
              Trades ({trades.length})
            </button>
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-4 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 mr-1" /> {error}
              </div>
            ) : historySubTab === "orders" ? (
              orderHistory.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No order history
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Time</th>
                      <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
                      <th className="text-right px-2 py-1.5 font-medium">Side</th>
                      <th className="text-right px-2 py-1.5 font-medium">Type</th>
                      <th className="text-right px-2 py-1.5 font-medium">Filled</th>
                      <th className="text-right px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map((order) => (
                      <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {formatTime(order.time)}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className="font-medium cursor-pointer hover:text-primary"
                            onClick={() => onSymbolSelect?.(order.symbol)}
                          >
                            {order.symbol}
                          </span>
                        </td>
                        <td
                          className={`text-right px-2 py-1.5 ${
                            order.side === "BUY" ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {order.side}
                        </td>
                        <td className="text-right px-2 py-1.5">{order.type}</td>
                        <td className="text-right px-2 py-1.5">
                          {order.executedQty}/{order.quantity}
                        </td>
                        <td className="text-right px-2 py-1.5">
                          <Badge
                            variant={order.status === "FILLED" ? "success" : order.status === "CANCELED" ? "danger" : "neutral"}
                            className="text-[10px] px-1 py-0"
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
              <div className="text-center py-4 text-xs text-muted-foreground">
                No trade history
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Time</th>
                    <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
                    <th className="text-right px-2 py-1.5 font-medium">Side</th>
                    <th className="text-right px-2 py-1.5 font-medium">Price</th>
                    <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium">PNL</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {formatTime(trade.timestamp)}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className="font-medium cursor-pointer hover:text-primary"
                          onClick={() => onSymbolSelect?.(trade.symbol)}
                        >
                          {trade.symbol}
                        </span>
                      </td>
                      <td
                        className={`text-right px-2 py-1.5 ${
                          trade.side === "BUY" ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {trade.side}
                      </td>
                      <td className="text-right px-2 py-1.5">{formatPrice(trade.price)}</td>
                      <td className="text-right px-2 py-1.5">{trade.quantity}</td>
                      <td
                        className={`text-right px-2 py-1.5 font-medium ${
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
