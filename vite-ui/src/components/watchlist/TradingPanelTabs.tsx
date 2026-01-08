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
  stopPrice?: number;
  orderType: string;
  side: string;
  status: string;
  filledQuantity: number;
  timestamp: string;
  orderCategory?: "basic" | "conditional";
  closePosition?: boolean;
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
  const HISTORY_PAGE_SIZE = 50;

  const [activeTab, setActiveTab] = useState("positions");
  const [historySubTab, setHistorySubTab] = useState<"orders" | "trades">(
    "orders"
  );
  const [historyTimeframe, setHistoryTimeframe] = useState<
    "24h" | "7d" | "30d" | "90d"
  >("24h");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState({
    orders: false,
    trades: false,
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountEquity, setAccountEquity] = useState<number>(0);

  // State for close position inputs per symbol
  const [closeInputs, setCloseInputs] = useState<
    Record<string, { price: string; quantity: string }>
  >({});
  const [activeQuantityInput, setActiveQuantityInput] = useState<string | null>(
    null
  );
  const [activePriceInput, setActivePriceInput] = useState<string | null>(null);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);

  // Refs for price inputs to refocus after order book price is applied
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Read config from localStorage
  const defaultRiskPercent = parseFloat(
    localStorage.getItem("openMandi_defaultRiskPercent") || "1"
  );
  const defaultTakeProfitPercent = parseFloat(
    localStorage.getItem("openMandi_defaultTakeProfitPercent") || "2"
  );

  // State for SL/TP inputs (now includes quantity)
  const [slTpInputs, setSlTpInputs] = useState<
    Record<string, { sl: string; tp: string; slQty: string; tpQty: string }>
  >({});

  // Track active input for showing risk/profit popup
  const [activeSlTpInput, setActiveSlTpInput] = useState<{
    symbol: string;
    field: "sl" | "tp";
  } | null>(null);

  // Helper to compute existing SL/TP quantities for a symbol from orders
  const getExistingSlTpQty = (posSymbol: string) => {
    let existingSlQty = 0;
    let existingTpQty = 0;

    orders.forEach((o) => {
      // Check for conditional orders (STOP_MARKET / TAKE_PROFIT_MARKET)
      // Also check standard STOP/TAKE_PROFIT if they are being correctly categorized
      if (o.symbol === posSymbol && (o.orderCategory === "conditional" || o.orderType.includes("STOP") || o.orderType.includes("PROFIT"))) {

        let qty = o.quantity || 0;
        if (o.closePosition) {
          // If closePosition is true, quantity is effectively the entire position.
          // We block new orders by treating this as a large quantity.
          qty = 999999999;
        }

        if (o.orderType === "STOP_MARKET" || o.orderType === "STOP") {
          existingSlQty += qty;
        } else if (o.orderType === "TAKE_PROFIT_MARKET" || o.orderType === "TAKE_PROFIT") {
          existingTpQty += qty;
        }
      }
    });
    return { existingSlQty, existingTpQty };
  };

  // Helper to calculate remaining quantity for SL/TP
  const getRemainingQty = (posSymbol: string, type: "sl" | "tp") => {
    const position = positions.find((p) => p.symbol === posSymbol);
    if (!position) return 0;
    const { existingSlQty, existingTpQty } = getExistingSlTpQty(posSymbol);
    if (type === "sl") {
      return Math.max(0, position.quantity - existingSlQty);
    }
    return Math.max(0, position.quantity - existingTpQty);
  };

  // Helper to compute SL/TP price from risk/profit percent of account equity
  const computeDefaultSlTp = (pos: Position) => {
    const entry = pos.averagePrice;
    const qty = pos.quantity;
    const isLong = pos.side === "LONG";

    // If no equity available, fall back to 0 (no prefill)
    if (!accountEquity || accountEquity <= 0 || qty <= 0) {
      return { slPrice: "", tpPrice: "" };
    }

    // Calculate risk/profit amounts as percentage of account equity
    const riskAmount = (accountEquity * defaultRiskPercent) / 100;
    const profitAmount = (accountEquity * defaultTakeProfitPercent) / 100;

    // Calculate price difference needed to achieve these amounts
    const slPriceDiff = riskAmount / qty;
    const tpPriceDiff = profitAmount / qty;

    // SL: price at which loss equals riskAmount
    // TP: price at which profit equals profitAmount
    const slPrice = isLong ? entry - slPriceDiff : entry + slPriceDiff;
    const tpPrice = isLong ? entry + tpPriceDiff : entry - tpPriceDiff;

    return {
      slPrice: slPrice > 0 ? formatPrice(slPrice) : "",
      tpPrice: tpPrice > 0 ? formatPrice(tpPrice) : "",
    };
  };

  const handleSlTpInputChange = (
    symbol: string,
    field: "sl" | "tp" | "slQty" | "tpQty",
    value: string
  ) => {
    setSlTpInputs((prev) => ({
      ...prev,
      [symbol]: {
        ...(prev[symbol] || { sl: "", tp: "", slQty: "", tpQty: "" }),
        [field]: value,
      },
    }));
  };

  // Prefill SL/TP values when positions change
  useEffect(() => {
    if (positions.length > 0) {
      setSlTpInputs((prev) => {
        const newInputs = { ...prev };
        positions.forEach((pos) => {
          if (!newInputs[pos.symbol]?.sl || !newInputs[pos.symbol]?.tp) {
            const defaults = computeDefaultSlTp(pos);
            const remainingSlQty = getRemainingQty(pos.symbol, "sl");
            const remainingTpQty = getRemainingQty(pos.symbol, "tp");
            newInputs[pos.symbol] = {
              sl: newInputs[pos.symbol]?.sl || defaults.slPrice,
              tp: newInputs[pos.symbol]?.tp || defaults.tpPrice,
              slQty: newInputs[pos.symbol]?.slQty || (remainingSlQty > 0 ? String(remainingSlQty) : ""),
              tpQty: newInputs[pos.symbol]?.tpQty || (remainingTpQty > 0 ? String(remainingTpQty) : ""),
            };
          }
        });
        return newInputs;
      });
    }
  }, [positions, orders, accountEquity]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlaceSlTp = async (posSymbol: string, type: "SL" | "TP") => {
    if (!selectedAccount) return;

    const position = positions.find((p) => p.symbol === posSymbol);
    if (!position) return;

    const input = slTpInputs[posSymbol];
    const price = type === "SL" ? input?.sl : input?.tp;
    const qtyStr = type === "SL" ? input?.slQty : input?.tpQty;

    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      alert(`Please enter a valid ${type} price`);
      return;
    }

    // Quantity: use input or remaining qty
    const remainingQty = getRemainingQty(posSymbol, type === "SL" ? "sl" : "tp");
    let quantity = qtyStr ? parseFloat(qtyStr) : remainingQty;
    if (isNaN(quantity) || quantity <= 0) {
      quantity = remainingQty;
    }
    if (quantity <= 0) {
      alert(`No remaining quantity available for ${type}. Existing orders already cover the position.`);
      return;
    }
    if (quantity > remainingQty) {
      alert(`Quantity (${quantity}) exceeds remaining (${remainingQty}). Reducing to ${remainingQty}.`);
      quantity = remainingQty;
    }

    const priceNum = parseFloat(price);
    const posSide = position.side; // "LONG" or "SHORT"

    // Quick validation
    if (type === "SL") {
      if (posSide === "LONG" && priceNum >= position.lastPrice) {
        alert("For LONG position, Stop Loss must be below current price");
        return;
      }
      if (posSide === "SHORT" && priceNum <= position.lastPrice) {
        alert("For SHORT position, Stop Loss must be above current price");
        return;
      }
    } else {
      // TP
      if (posSide === "LONG" && priceNum <= position.lastPrice) {
        alert("For LONG position, Take Profit must be above current price");
        return;
      }
      if (posSide === "SHORT" && priceNum >= position.lastPrice) {
        alert("For SHORT position, Take Profit must be below current price");
        return;
      }
    }

    const confirmMsg = `Place ${type} order for ${quantity} ${posSymbol} at ${price}?`;
    if (!confirm(confirmMsg)) return;

    try {
      const orderSide = posSide === "LONG" ? "SELL" : "BUY";
      const orderType = type === "SL" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET";

      const orderData: any = {
        accountId: selectedAccount._id,
        symbol: posSymbol,
        side: orderSide,
        type: orderType,
        quantity: quantity,
        stopPrice: price,
        reduceOnly: true,
        timeInForce: "GTC",
      };

      await api.post("/orders/place", orderData);

      // Clear inputs on success
      handleSlTpInputChange(posSymbol, type === "SL" ? "sl" : "tp", "");
      handleSlTpInputChange(posSymbol, type === "SL" ? "slQty" : "tpQty", "");

      // Refresh to show new order
      fetchData();
      alert(`${type} order placed successfully`);
    } catch (err: any) {
      console.error(`Failed to place ${type}:`, err);
      alert(
        err.response?.data?.error || err.message || `Failed to place ${type} order`
      );
    }
  };

  const fetchData = useCallback(async () => {
    if (!selectedAccount) return;

    setLoading(true);
    setError(null);

    try {
      const cacheKey = `${selectedAccount._id}-${activeTab}-${symbol || ""
        }-${historyTimeframe}-${activeTab === "history" ? historyPage : 0}`;
      let promise = TABS_DATA_CACHE.get(cacheKey);

      if (!promise) {
        promise = (async () => {
          try {
            // Fetch based on active tab
            if (activeTab === "positions") {
              const response = await api.get(
                `/positions?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`
              );
              return { type: "positions", data: response.data };
            } else if (activeTab === "orders") {
              const response = await api.get(
                `/orders?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`
              );
              return { type: "orders", data: response.data };
            } else if (activeTab === "history") {
              // History endpoints only available for Binance accounts
              if (selectedAccount.accountType === "binance") {
                // Fetch both order history and trade history with timeframe
                // Don't filter by symbol - show all symbols like positions/orders tabs
                const timeframeQuery = `&timeframe=${historyTimeframe}`;
                const pageQuery = `&page=${historyPage}&pageSize=${HISTORY_PAGE_SIZE}`;
                const [orderRes, tradeRes] = await Promise.all([
                  api.get(
                    `/binance/order-history?accountId=${selectedAccount._id}${timeframeQuery}${pageQuery}`
                  ),
                  api.get(
                    `/binance/trade-history?accountId=${selectedAccount._id}${timeframeQuery}${pageQuery}`
                  ),
                ]);
                return {
                  type: "history",
                  orderData: orderRes.data,
                  tradeData: tradeRes.data,
                };
              } else {
                // Return empty history for non-Binance accounts
                return {
                  type: "history",
                  orderData: { success: true, orders: [] },
                  tradeData: { success: true, trades: [] },
                };
              }
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

      if (activeTab === "positions" && result?.type === "positions") {
        if (result.data?.success) {
          const posData = result.data.data || result.data.positions || [];
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

          // Also fetch orders for SL/TP remaining qty calculation
          try {
            const ordersResp = await api.get(
              `/orders?vendor=${selectedAccount.accountType}&accountId=${selectedAccount._id}`
            );
            if (ordersResp.data?.success) {
              const ordersArray = ordersResp.data.orders || ordersResp.data.data || [];
              setOrders(
                ordersArray.map((o: any) => ({
                  id: o.id || o.orderId,
                  symbol: o.symbol,
                  quantity: parseFloat(o.quantity || o.origQty) || 0,
                  price: parseFloat(o.price) || 0,
                  stopPrice: parseFloat(o.stopPrice) || 0,
                  orderType: o.orderType || o.type,
                  side: o.transactionType || o.side,
                  status: o.status,
                  filledQuantity: parseFloat(o.filledQuantity || o.executedQty) || 0,
                  timestamp: o.timestamp || o.time,
                  orderCategory: o.orderCategory,
                  closePosition: o.closePosition,
                }))
              );
            }
          } catch (ordersErr) {
            // Ignore order fetch errors for calculations
          }

          // Also fetch account equity for percentage calculation (Binance only)
          if (selectedAccount.accountType === "binance") {
            try {
              const detailsResp = await api.get(
                `/binance/position-details?accountId=${selectedAccount._id}`
              );
              if (detailsResp.data?.success && detailsResp.data?.account?.equity) {
                setAccountEquity(detailsResp.data.account.equity);
              }
            } catch (eqErr) {
              // Ignore equity fetch errors
            }
          }
        }
      } else if (activeTab === "orders" && result?.type === "orders") {
        if (result.data?.success) {
          // Filter to only open orders - check both 'orders' and 'data' arrays
          const ordersArray = result.data.orders || result.data.data || [];
          setOrders(
            ordersArray
              .filter(
                (o: any) =>
                  o.status === "NEW" || o.status === "PARTIALLY_FILLED"
              )
              .map((o: any) => ({
                id: o.id || o.orderId,
                symbol: o.symbol,
                quantity: o.quantity || o.origQty,
                price: o.price,
                stopPrice: parseFloat(o.stopPrice) || 0,
                orderType: o.orderType || o.type,
                side: o.transactionType || o.side,
                status: o.status,
                filledQuantity: o.filledQuantity || o.executedQty || 0,
                timestamp: o.timestamp || o.time,
              }))
          );
        }
      } else if (activeTab === "history" && result?.type === "history") {
        if (result.orderData?.success) {
          setHistoryHasMore((prev) => ({
            ...prev,
            orders: !!result.orderData?.hasMore,
          }));
          setOrderHistory(
            (result.orderData.orders || []).map(
              (o: Record<string, unknown>) => ({
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
              })
            )
          );
        } else {
          setHistoryHasMore((prev) => ({ ...prev, orders: false }));
        }

        if (result.tradeData?.success) {
          setHistoryHasMore((prev) => ({
            ...prev,
            trades: !!result.tradeData?.hasMore,
          }));
          setTrades(
            (result.tradeData.trades || []).map((t: Record<string, unknown>) => ({
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
        } else {
          setHistoryHasMore((prev) => ({ ...prev, trades: false }));
        }
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch data";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [
    selectedAccount,
    activeTab,
    symbol,
    historyTimeframe,
    historyPage,
    HISTORY_PAGE_SIZE,
  ]);

  useEffect(() => {
    if (activeTab !== "history") return;
    setHistoryPage(1);
  }, [activeTab, selectedAccount?._id, historyTimeframe]);

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
    const numPrice = typeof price === "string" ? parseFloat(price) : price;
    if (!numPrice || numPrice === 0 || isNaN(numPrice)) return "0";
    const absPrice = Math.abs(numPrice);

    // Dynamic decimal places based on price magnitude
    // This approximates tick size behavior for most trading pairs
    if (absPrice >= 10000) return numPrice.toFixed(1); // BTC: 0.1
    if (absPrice >= 1000) return numPrice.toFixed(2); // ETH, etc: 0.01
    if (absPrice >= 100) return numPrice.toFixed(2); // Mid-range: 0.01
    if (absPrice >= 10) return numPrice.toFixed(3); // Lower: 0.001
    if (absPrice >= 1) return numPrice.toFixed(4); // Sub-dollar: 0.0001
    if (absPrice >= 0.1) return numPrice.toFixed(5); // Very low: 0.00001
    if (absPrice >= 0.01) return numPrice.toFixed(6); // Micro: 0.000001
    if (absPrice >= 0.001) return numPrice.toFixed(7); // Sub-micro: 0.0000001
    return numPrice.toFixed(8); // Nano-cap: 0.00000001
  };

  const getTickSize = (price: number | string) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : price;
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
    const date = new Date(
      typeof timestamp === "number" ? timestamp : parseInt(timestamp)
    );
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

  const handleCloseInputChange = (
    symbol: string,
    field: "price" | "quantity",
    value: string
  ) => {
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

    const quantityValue =
      Math.floor(position.quantity * (percentage / 100) * 1000) / 1000; // Round down to 3 decimals
    setCloseInputs((prev) => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        quantity: String(quantityValue),
      },
    }));
    setActiveQuantityInput(null);
  };

  const handleClosePosition = async (
    posSymbol: string,
    orderType: "MARKET" | "LIMIT"
  ) => {
    if (!selectedAccount) return;

    const position = positions.find((p) => p.symbol === posSymbol);
    if (!position) return;

    const inputs = closeInputs[posSymbol];
    if (!inputs) return;

    const quantity = parseFloat(inputs.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert("Please enter a valid quantity");
      return;
    }

    if (orderType === "LIMIT") {
      const price = parseFloat(inputs.price);
      if (isNaN(price) || price <= 0) {
        alert("Please enter a valid price for limit order");
        return;
      }
    }

    const confirmMsg =
      orderType === "MARKET"
        ? `Close ${quantity} ${posSymbol} at MARKET price?`
        : `Close ${quantity} ${posSymbol} at LIMIT price ${inputs.price}?`;

    if (!confirm(confirmMsg)) return;

    setClosingPosition(posSymbol);

    try {
      // Close position = opposite side order
      const closeSide = position.side === "LONG" ? "SELL" : "BUY";

      const orderData: any = {
        accountId: selectedAccount._id,
        symbol: posSymbol,
        side: closeSide,
        type: orderType,
        quantity: quantity,
        reduceOnly: true,
      };

      if (orderType === "LIMIT") {
        orderData.price = parseFloat(inputs.price);
      }

      await api.post("/orders/place", orderData);

      // Refresh positions
      fetchData();
    } catch (err: any) {
      console.error("Failed to close position:", err);
      alert(
        err.response?.data?.error || err.message || "Failed to close position"
      );
    } finally {
      setClosingPosition(null);
    }
  };

  const handleCloseAllPositions = async () => {
    if (!selectedAccount || positions.length === 0) return;

    const confirmMsg = `Close ALL ${positions.length} positions at MARKET price? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setClosingPosition("all");

    try {
      // Close all positions sequentially
      for (const position of positions) {
        const closeSide = position.side === "LONG" ? "SELL" : "BUY";

        await api.post("/orders/place", {
          accountId: selectedAccount._id,
          symbol: position.symbol,
          side: closeSide,
          type: "MARKET",
          quantity: position.quantity,
          reduceOnly: true,
        });
      }

      // Refresh positions
      fetchData();
    } catch (err: any) {
      console.error("Failed to close all positions:", err);
      alert(
        err.response?.data?.error ||
        err.message ||
        "Failed to close all positions"
      );
    } finally {
      setClosingPosition(null);
    }
  };

  return (
    <div className="w-full bg-card rounded-md border shadow-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between px-2 border-b overflow-x-auto">
          <TabsList className="h-12 bg-transparent p-0 rounded-none flex-shrink-0">
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
                    <th className="text-right px-2 py-2 font-medium">PNL</th>
                    <th className="text-center px-2 py-2 font-medium w-[140px]">
                      TP / SL
                    </th>
                    <th className="text-center px-2 py-2 font-medium min-w-[160px]">
                      Price / Qty
                    </th>
                    <th className="text-center px-2 py-2 font-medium">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-sm px-3 shadow-sm hover:brightness-110 transition-all"
                        onClick={handleCloseAllPositions}
                        disabled={closingPosition !== null}
                      >
                        {closingPosition === "all" ? "..." : "Close All"}
                      </Button>
                    </th>
                    <th className="text-right px-2 py-2 font-medium">B/E</th>
                    <th className="text-right px-2 py-2 font-medium">Liq</th>
                    <th className="text-right px-2 py-2 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td
                        className="px-2 py-2 cursor-pointer"
                        onClick={() => onSymbolSelect?.(pos.symbol)}
                      >
                        <div className="flex items-center gap-1">
                          {pos.side === "LONG" ? (
                            <TrendingUp className="w-5 h-5 text-green-500" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-red-500" />
                          )}
                          <span className="font-medium">{pos.symbol}</span>
                          {pos.leverage && (
                            <Badge
                              variant="neutral"
                              className="text-sm px-1.5 py-0.5"
                            >
                              {pos.leverage}x
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-right px-2 py-2">{pos.quantity}</td>
                      <td className="text-right px-2 py-2">
                        {formatPrice(pos.averagePrice)}
                      </td>
                      <td
                        className={`text-right px-2 py-2 font-medium ${pos.pnl >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                      >
                        ${pos.pnl.toFixed(2)}
                      </td>
                      <td className="px-1 py-1 align-middle">
                        {(() => {
                          const defaults = computeDefaultSlTp(pos);
                          const tpVal = slTpInputs[pos.symbol]?.tp || "";
                          const slVal = slTpInputs[pos.symbol]?.sl || "";
                          const tpQty = slTpInputs[pos.symbol]?.tpQty || "";
                          const slQty = slTpInputs[pos.symbol]?.slQty || "";
                          const remainingSlQty = getRemainingQty(pos.symbol, "sl");
                          const remainingTpQty = getRemainingQty(pos.symbol, "tp");

                          // Calculate risk/profit in $
                          const calcPnl = (price: string, qty: string, type: "sl" | "tp") => {
                            const p = parseFloat(price);
                            const q = parseFloat(qty) || (type === "sl" ? remainingSlQty : remainingTpQty);
                            if (!p || !q) return null;
                            const diff = pos.side === "LONG"
                              ? (p - pos.averagePrice) * q
                              : (pos.averagePrice - p) * q;
                            return diff;
                          };
                          const tpPnl = calcPnl(tpVal, tpQty, "tp");
                          const slPnl = calcPnl(slVal, slQty, "sl");

                          return (
                            <div className="flex flex-col gap-0.5 relative">
                              {/* TP Row */}
                              <div className="flex gap-0.5 items-center">
                                <input
                                  type="number"
                                  placeholder={defaults.tpPrice}
                                  className="w-20 h-6 text-xs px-1 border border-green-500/30 rounded bg-background text-right focus:ring-1 focus:ring-green-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={tpVal}
                                  onChange={(e) =>
                                    handleSlTpInputChange(pos.symbol, "tp", e.target.value)
                                  }
                                  onFocus={() => setActiveSlTpInput({ symbol: pos.symbol, field: "tp" })}
                                  onBlur={() => setTimeout(() => setActiveSlTpInput(null), 200)}
                                  onClick={(e) => e.stopPropagation()}
                                  step={getTickSize(pos.lastPrice)}
                                />
                                <input
                                  type="number"
                                  placeholder={String(remainingTpQty)}
                                  className="w-10 h-6 text-xs px-0.5 border border-green-500/20 rounded bg-background text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={tpQty}
                                  onChange={(e) =>
                                    handleSlTpInputChange(pos.symbol, "tpQty", e.target.value)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  title={`Qty (remaining: ${remainingTpQty})`}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                  title="Set Take Profit"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlaceSlTp(pos.symbol, "TP");
                                  }}
                                  disabled={!tpVal && !defaults.tpPrice}
                                >
                                  <TrendingUp className="w-3 h-3" />
                                </Button>
                              </div>
                              {/* TP PnL popup */}
                              {activeSlTpInput?.symbol === pos.symbol && activeSlTpInput?.field === "tp" && tpPnl !== null && (
                                <div className="absolute left-0 top-7 z-50 bg-popover border rounded shadow-lg px-2 py-1 text-xs animate-in fade-in zoom-in-95">
                                  <span className={tpPnl >= 0 ? "text-green-500" : "text-red-500"}>
                                    {tpPnl >= 0 ? "+" : ""}${tpPnl.toFixed(2)}
                                    {accountEquity > 0 && (
                                      <span className="text-muted-foreground ml-1">
                                        ({((Math.abs(tpPnl) / accountEquity) * 100).toFixed(2)}%)
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {/* SL Row */}
                              <div className="flex gap-0.5 items-center">
                                <input
                                  type="number"
                                  placeholder={defaults.slPrice}
                                  className="w-20 h-6 text-xs px-1 border border-red-500/30 rounded bg-background text-right focus:ring-1 focus:ring-red-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={slVal}
                                  onChange={(e) =>
                                    handleSlTpInputChange(pos.symbol, "sl", e.target.value)
                                  }
                                  onFocus={() => setActiveSlTpInput({ symbol: pos.symbol, field: "sl" })}
                                  onBlur={() => setTimeout(() => setActiveSlTpInput(null), 200)}
                                  onClick={(e) => e.stopPropagation()}
                                  step={getTickSize(pos.lastPrice)}
                                />
                                <input
                                  type="number"
                                  placeholder={String(remainingSlQty)}
                                  className="w-10 h-6 text-xs px-0.5 border border-red-500/20 rounded bg-background text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={slQty}
                                  onChange={(e) =>
                                    handleSlTpInputChange(pos.symbol, "slQty", e.target.value)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  title={`Qty (remaining: ${remainingSlQty})`}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                  title="Set Stop Loss"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlaceSlTp(pos.symbol, "SL");
                                  }}
                                  disabled={!slVal && !defaults.slPrice}
                                >
                                  <TrendingDown className="w-3 h-3" />
                                </Button>
                              </div>
                              {/* SL PnL popup */}
                              {activeSlTpInput?.symbol === pos.symbol && activeSlTpInput?.field === "sl" && slPnl !== null && (
                                <div className="absolute left-0 top-14 z-50 bg-popover border rounded shadow-lg px-2 py-1 text-xs animate-in fade-in zoom-in-95">
                                  <span className={slPnl >= 0 ? "text-green-500" : "text-red-500"}>
                                    {slPnl >= 0 ? "+" : ""}${slPnl.toFixed(2)}
                                    {accountEquity > 0 && (
                                      <span className="text-muted-foreground ml-1">
                                        ({((Math.abs(slPnl) / accountEquity) * 100).toFixed(2)}%)
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-1 py-2">
                        <div className="relative flex gap-1">
                          <input
                            ref={(el) => {
                              priceInputRefs.current[pos.symbol] = el;
                            }}
                            type="number"
                            value={closeInputs[pos.symbol]?.price || ""}
                            onChange={(e) =>
                              handleCloseInputChange(
                                pos.symbol,
                                "price",
                                e.target.value
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setActivePriceInput(pos.symbol)}
                            onBlur={() =>
                              setTimeout(() => setActivePriceInput(null), 200)
                            }
                            className="w-36 h-8 text-sm px-2 border rounded bg-background text-right focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Price"
                            step={getTickSize(pos.lastPrice)}
                          />
                          <input
                            type="number"
                            value={closeInputs[pos.symbol]?.quantity || ""}
                            onChange={(e) =>
                              handleCloseInputChange(
                                pos.symbol,
                                "quantity",
                                e.target.value
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setActiveQuantityInput(pos.symbol)}
                            onBlur={() =>
                              setTimeout(
                                () => setActiveQuantityInput(null),
                                200
                              )
                            }
                            className="w-32 h-8 text-sm px-2 border rounded bg-background text-right focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                              handleClosePosition(pos.symbol, "MARKET");
                            }}
                            disabled={closingPosition !== null}
                          >
                            {closingPosition === pos.symbol ? "..." : "Mkt"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-sm px-3 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white shadow-sm transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClosePosition(pos.symbol, "LIMIT");
                            }}
                            disabled={closingPosition !== null}
                          >
                            Lmt
                          </Button>
                        </div>
                      </td>
                      <td className="text-right px-2 py-2 text-muted-foreground">
                        {pos.breakEvenPrice
                          ? formatPrice(pos.breakEvenPrice)
                          : "-"}
                      </td>
                      <td className="text-right px-2 py-2 text-orange-500">
                        {pos.liquidationPrice
                          ? formatPrice(pos.liquidationPrice)
                          : "-"}
                      </td>
                      <td className="text-right px-2 py-2">
                        {pos.margin ? `$${pos.margin.toFixed(2)}` : "-"}
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
                    <tr
                      key={order.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="px-2 py-2">
                        <span
                          className="font-medium cursor-pointer hover:text-primary"
                          onClick={() => onSymbolSelect?.(order.symbol)}
                        >
                          {order.symbol}
                        </span>
                      </td>
                      <td className="text-right px-2 py-2">
                        {order.orderType}
                      </td>
                      <td
                        className={`text-right px-2 py-2 ${order.side === "BUY"
                          ? "text-green-500"
                          : "text-red-500"
                          }`}
                      >
                        {order.side}
                      </td>
                      <td className="text-right px-2 py-2">
                        {order.stopPrice && order.stopPrice > 0
                          ? formatPrice(order.stopPrice)
                          : formatPrice(order.price)}
                      </td>
                      <td className="text-right px-2 py-2">
                        {order.filledQuantity}/{order.quantity}
                      </td>
                      <td className="text-center px-2 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            handleCancelOrder(order.id, order.symbol)
                          }
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
          {/* Sub-tabs for Orders vs Trades + Timeframe selector */}
          <div className="flex items-center justify-between border-b px-2 text-base">
            <div className="flex gap-2">
              <button
                className={`py-2 px-2 ${historySubTab === "orders"
                  ? "border-b-2 border-primary font-medium"
                  : "text-muted-foreground"
                  }`}
                onClick={() => setHistorySubTab("orders")}
              >
                Order History ({orderHistory.length})
              </button>
              <button
                className={`py-2 px-2 ${historySubTab === "trades"
                  ? "border-b-2 border-primary font-medium"
                  : "text-muted-foreground"
                  }`}
                onClick={() => setHistorySubTab("trades")}
              >
                Trades ({trades.length})
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={loading || historyPage <= 1}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  value={historyPage}
                  onChange={(e) =>
                    setHistoryPage(
                      Math.max(1, parseInt(e.target.value, 10) || 1)
                    )
                  }
                  className="w-16 text-xs px-2 py-1 border rounded bg-background text-foreground"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={
                  loading ||
                  !(historySubTab === "orders"
                    ? historyHasMore.orders
                    : historyHasMore.trades)
                }
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Next
              </Button>
              <select
                value={historyTimeframe}
                onChange={(e) =>
                  setHistoryTimeframe(
                    e.target.value as "24h" | "7d" | "30d" | "90d"
                  )
                }
                className="text-xs px-2 py-1 border rounded bg-background text-foreground"
              >
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
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
                      <th className="text-left px-2 py-2 font-medium">
                        Symbol
                      </th>
                      <th className="text-right px-2 py-2 font-medium">Side</th>
                      <th className="text-right px-2 py-2 font-medium">Type</th>
                      <th className="text-right px-2 py-2 font-medium">
                        Filled
                      </th>
                      <th className="text-right px-2 py-2 font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-border/50 hover:bg-muted/30"
                      >
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
                          className={`text-right px-2 py-2 ${order.side === "BUY"
                            ? "text-green-500"
                            : "text-red-500"
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
                            variant={
                              order.status === "FILLED"
                                ? "success"
                                : order.status === "CANCELED"
                                  ? "danger"
                                  : "neutral"
                            }
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
                    <tr
                      key={trade.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
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
                        className={`text-right px-2 py-2 ${trade.side === "BUY"
                          ? "text-green-500"
                          : "text-red-500"
                          }`}
                      >
                        {trade.side}
                      </td>
                      <td className="text-right px-2 py-2">
                        {formatPrice(trade.price)}
                      </td>
                      <td className="text-right px-2 py-2">{trade.quantity}</td>
                      <td
                        className={`text-right px-2 py-2 font-medium ${trade.realizedPnl >= 0
                          ? "text-green-500"
                          : "text-red-500"
                          }`}
                      >
                        {trade.realizedPnl !== 0
                          ? `$${trade.realizedPnl.toFixed(2)}`
                          : "-"}
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
