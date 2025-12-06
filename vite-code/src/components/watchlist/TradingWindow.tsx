import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPercent, formatPrice } from "@/lib/format-utils";
import api from "@/lib/api";
import { HelpCircle, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MarketDepth from "./MarketDepth";
import MultiTimeframeChart from "./MultiTimeframeChart";
import TradingPanelTabs from "./TradingPanelTabs";

// Global promise cache to deduplicate simultaneous fetches
const DETAILS_PROMISE_CACHE = new Map<string, Promise<any>>();

interface TradingWindowProps {
  symbol: string;
  currentPrice: number;
  accounts: Array<{
    _id: string;
    accountName: string;
    accountType: "binance" | "kite" | "upstox";
    isActive: boolean;
  }>;
  selectedAccount?: {
    _id: string;
    accountName: string;
    accountType: "binance" | "kite" | "upstox";
    isActive: boolean;
  } | null;
  marketType?: "spot" | "futures";
  onOrderPlaced: () => void;
  onSymbolSelect?: (symbol: string) => void;
}

interface OrderForm {
  accountId: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity: string;
  price: string;
  stopPrice: string;
  leverage: string;
  reduceOnly: boolean;
  stopLoss: string;
  takeProfit: string;
}

const DETAILS_REFRESH_INTERVAL = 60000; // 60 seconds between automatic refreshes

const TradingWindow = memo(function TradingWindow({
  symbol,
  currentPrice,
  accounts,
  selectedAccount,
  marketType = "futures",
  onOrderPlaced,
  onSymbolSelect,
}: TradingWindowProps) {
  const [orderForm, setOrderForm] = useState<OrderForm>({
    accountId: selectedAccount?._id || accounts[0]?._id || "",
    side: "BUY",
    type: "LIMIT",
    quantity: "0.001",
    price: currentPrice.toFixed(2), // Initial value, will be updated by effect
    stopPrice: "",
    leverage: "1",
    reduceOnly: false,
    stopLoss: "",
    takeProfit: "",
  });

  const [positionSizePercentage, setPositionSizePercentage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [hasUserEditedPrice, setHasUserEditedPrice] = useState(false);
  const [hasUserEditedSL, setHasUserEditedSL] = useState(false);
  const [hasUserEditedTP, setHasUserEditedTP] = useState(false);
  const [accountDetails, setAccountDetails] = useState<any>(null);
  const [exchangeMaxLeverage, setExchangeMaxLeverage] = useState<number>(125);
  const [tickSize, setTickSize] = useState<string>("0.01");
  const [stepSize, setStepSize] = useState<string>("0.001");
  const [isExponentialSlider, setIsExponentialSlider] = useState(false);
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);
  const [isRefreshingDetails, setIsRefreshingDetails] = useState(false);
  const [orderBookPrice, setOrderBookPrice] = useState<string | null>(null);

  const [lastDetailsRefresh, setLastDetailsRefresh] = useState<number | null>(null);
  
  // Track if we've synced leverage from the exchange for the current session/symbol
  const hasSyncedLeverage = useRef(false);

  // Reset synced state when symbol or account changes
  useEffect(() => {
    hasSyncedLeverage.current = false;
    setHasUserEditedPrice(false);
  }, [symbol, selectedAccount?._id]);
  // User-defined max leverage (stored in localStorage)
  const [userMaxLeverage, setUserMaxLeverage] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("flipSafe_userMaxLeverage");
      return stored ? parseInt(stored, 10) : 20;
    } catch {
      return 20;
    }
  });
  
  // User-defined default risk percentage (default 1%)
  const [defaultRiskPercent, setDefaultRiskPercent] = useState<string>(() => {
    return localStorage.getItem("flipSafe_defaultRiskPercent") || "1";
  });

  // Derived: current default risk amount in dollars (if balance known)
  const defaultRiskAmount = useMemo(() => {
    const pct = parseFloat(defaultRiskPercent || "0");
    if (!availableBalance || isNaN(pct) || pct <= 0) return null;
    return (availableBalance * pct) / 100;
  }, [availableBalance, defaultRiskPercent]);

  // User-defined default take profit percentage (optional)
  const [defaultTakeProfitPercent, setDefaultTakeProfitPercent] = useState<string>(() => {
    return localStorage.getItem("flipSafe_defaultTakeProfitPercent") || "";
  });

  // Effective max leverage is min of exchange max and user max
  const maxLeverage = Math.min(exchangeMaxLeverage, userMaxLeverage);

  // Helper to round value to nearest step size
  const roundToStep = (value: number, step: string): string => {
    const stepNum = parseFloat(step);
    if (stepNum <= 0 || isNaN(stepNum)) return value.toFixed(8);
    const decimals = step.includes('.') ? step.split('.')[1].replace(/0+$/, '').length : 0;
    const rounded = Math.round(value / stepNum) * stepNum;
    return rounded.toFixed(decimals);
  };

  // Save user max leverage to localStorage
  const handleUserMaxLeverageChange = (value: number) => {
    setUserMaxLeverage(value);
    localStorage.setItem("flipSafe_userMaxLeverage", String(value));
    // Also update form leverage if current is higher than new max
    const effectiveMax = Math.min(exchangeMaxLeverage, value);
    if (parseInt(orderForm.leverage) > effectiveMax) {
      setOrderForm(prev => ({ ...prev, leverage: String(effectiveMax) }));
    }
  };

  // Save default risk percentage to localStorage
  const handleDefaultRiskChange = (value: string) => {
    setDefaultRiskPercent(value);
    if (value) {
      localStorage.setItem("flipSafe_defaultRiskPercent", value);
    } else {
      localStorage.removeItem("flipSafe_defaultRiskPercent");
    }
  };

  // Save default take profit percentage to localStorage
  const handleDefaultTakeProfitChange = (value: string) => {
    setDefaultTakeProfitPercent(value);
    if (value) {
      localStorage.setItem("flipSafe_defaultTakeProfitPercent", value);
    } else {
      localStorage.removeItem("flipSafe_defaultTakeProfitPercent");
    }
  };

  // Helper to calculate decimals from price
  const calculatePriceDecimals = (price: number): number => {
    if (price >= 1000) return 1;
    if (price >= 100) return 2;
    if (price >= 10) return 3;
    if (price >= 1) return 4;
    if (price >= 0.1) return 5;
    return 6;
  };

  // Update price when current price changes (only if user hasn't manually edited it)
  // Update price when current price changes (only if user hasn't manually edited it)
  useEffect(() => {
    if (orderForm.type === "LIMIT" && !hasUserEditedPrice) {
      const decimals = tickSize.includes('.') ? tickSize.split('.')[1].replace(/0+$/, '').length : 2;
      setOrderForm((prev) => ({ ...prev, price: currentPrice.toFixed(decimals) }));
    }
  }, [currentPrice, orderForm.type, hasUserEditedPrice, tickSize]);

  // Auto-calculate Stop Loss based on 5% risk rule
  useEffect(() => {
    if (hasUserEditedSL || !availableBalance || !orderForm.quantity) return;

    const qty = parseFloat(orderForm.quantity);
    const entryPrice = orderForm.type === "LIMIT" ? parseFloat(orderForm.price) : currentPrice;
    
    if (qty > 0 && entryPrice > 0) {
      // Risk 5% of total capital
      const riskAmount = availableBalance * 0.05;
      const priceDiff = riskAmount / qty;
      
      let slPrice;
      if (orderForm.side === "BUY") {
        slPrice = entryPrice - priceDiff;
      } else {
        slPrice = entryPrice + priceDiff;
      }
      
      // Ensure SL is positive and round to tick size
      if (slPrice > 0) {
        setOrderForm(prev => ({ ...prev, stopLoss: roundToStep(slPrice, tickSize) }));
      }
    }
  }, [orderForm.quantity, orderForm.price, orderForm.side, currentPrice, availableBalance, hasUserEditedSL]);

  // Update SL when defaultRiskPercent, quantity, price, or side changes
  useEffect(() => {
    if (!defaultRiskPercent || !orderForm.quantity || !orderForm.price || !availableBalance) return;
    
    const riskPercent = parseFloat(defaultRiskPercent);
    const qty = parseFloat(orderForm.quantity);
    const price = parseFloat(orderForm.price);
    
    if (isNaN(riskPercent) || isNaN(qty) || isNaN(price) || qty === 0 || riskPercent <= 0) return;
    
    // Calculate risk amount as percentage of available balance
    const riskAmount = (availableBalance * riskPercent) / 100;
    const riskPerUnit = riskAmount / qty;
    let newSL = 0;
    
    if (orderForm.side === "BUY") {
      newSL = price - riskPerUnit;
    } else {
      newSL = price + riskPerUnit;
    }
    
    if (newSL > 0) {
      // Round to tick size
      const tick = parseFloat(tickSize);
      const roundedSL = Math.round(newSL / tick) * tick;
      
      // Only update if different to avoid loops
      if (Math.abs(roundedSL - parseFloat(orderForm.stopLoss || "0")) > Number.EPSILON) {
        setOrderForm(prev => ({ ...prev, stopLoss: roundedSL.toFixed(calculatePriceDecimals(price)) }));
      }
    }
  }, [defaultRiskPercent, orderForm.quantity, orderForm.price, orderForm.side, tickSize, availableBalance]);

  // Auto-calculate Take Profit based on default percentage
  useEffect(() => {
    if (hasUserEditedTP || !defaultTakeProfitPercent) return;
    
    const tpPercent = parseFloat(defaultTakeProfitPercent);
    const price = parseFloat(orderForm.price);
    
    if (isNaN(tpPercent) || isNaN(price) || tpPercent <= 0 || price <= 0) return;
    
    let newTP = 0;
    
    if (orderForm.side === "BUY") {
      // For long, TP is above entry price
      newTP = price * (1 + tpPercent / 100);
    } else {
      // For short, TP is below entry price
      newTP = price * (1 - tpPercent / 100);
    }
    
    if (newTP > 0) {
      const tick = parseFloat(tickSize);
      const roundedTP = Math.round(newTP / tick) * tick;
      
      // Only update if different to avoid loops
      if (Math.abs(roundedTP - parseFloat(orderForm.takeProfit || "0")) > Number.EPSILON) {
        setOrderForm(prev => ({ ...prev, takeProfit: roundedTP.toFixed(calculatePriceDecimals(price)) }));
      }
    }
  }, [defaultTakeProfitPercent, orderForm.price, orderForm.side, tickSize, hasUserEditedTP]);

  const fetchAccountAndPositionDetails = useCallback(async () => {
    if (!selectedAccount) return;

    setIsRefreshingDetails(true);
    try {
      const cacheKey = `${selectedAccount._id}-${symbol}`;
      let promise = DETAILS_PROMISE_CACHE.get(cacheKey);

      if (!promise) {
        promise = (async () => {
          try {
            if (selectedAccount.accountType === "binance") {
              const response = await api.get("/binance/position-details", {
                params: {
                  accountId: selectedAccount._id,
                  symbol,
                },
              });
              return { type: 'binance', data: response.data };
            } else {
              const response = await api.get(`/funds?accountId=${selectedAccount._id}`);
              return { type: 'other', data: response.data };
            }
          } catch (e) {
            throw e;
          } finally {
            // Clear cache after 2 seconds
            setTimeout(() => {
              DETAILS_PROMISE_CACHE.delete(cacheKey);
            }, 2000);
          }
        })();
        DETAILS_PROMISE_CACHE.set(cacheKey, promise);
      }

      const result = await promise;

      if (result.type === 'binance') {
        const data = result.data;
        if (data && data.success) {
          setAccountDetails(data.account);

          let newExchangeMaxLeverage = 125;
          if (data.symbolInfo?.maxLeverage) {
            newExchangeMaxLeverage = data.symbolInfo.maxLeverage;
          } else if (data.position?.maxLeverage) {
            newExchangeMaxLeverage = data.position.maxLeverage;
          }
          setExchangeMaxLeverage(newExchangeMaxLeverage);

          if (data.symbolInfo?.tickSize) {
            setTickSize(data.symbolInfo.tickSize);
          }
          if (data.symbolInfo?.stepSize) {
            setStepSize(data.symbolInfo.stepSize);
          }

          // Only sync leverage if we haven't done so yet for this session
          if (!hasSyncedLeverage.current) {
            const effectiveMaxLeverage = Math.min(newExchangeMaxLeverage, userMaxLeverage);
            const currentPositionLeverage = data.position?.leverage;
            const defaultLeverage = currentPositionLeverage
              ? Math.min(currentPositionLeverage, effectiveMaxLeverage)
              : effectiveMaxLeverage;
            
            setOrderForm((prev) => ({
              ...prev,
              leverage: String(defaultLeverage),
            }));
            hasSyncedLeverage.current = true;
          }

          const equity = data.account.equity || 0;
          const available = data.account.availableBalance || equity;
          setAvailableBalance(available);
        }
      } else {
        const data = result.data;
        if (data && data.available) {
          setAvailableBalance(parseFloat(data.available) || 0);
        } else if (data && data.data) {
          const balance = data.data.availableCash || data.data.net || 0;
          setAvailableBalance(parseFloat(balance));
        }
      }

      setLastDetailsRefresh(Date.now());
    } catch (err) {
      console.error("Failed to fetch account details:", err);
    } finally {
      setIsRefreshingDetails(false);
    }
  }, [selectedAccount, symbol, userMaxLeverage]);

  useEffect(() => {
    if (!selectedAccount) return;

    fetchAccountAndPositionDetails();
    const interval = setInterval(() => {
      fetchAccountAndPositionDetails();
    }, DETAILS_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchAccountAndPositionDetails, selectedAccount, symbol]);

  const handleInputChange = (
    field: keyof OrderForm,
    value: string | boolean
  ) => {
    setOrderForm((prev) => ({ ...prev, [field]: value }));
    // Track if user manually edited price
    if (field === 'price') {
      setHasUserEditedPrice(true);
    }
    if (field === 'stopLoss') {
      setHasUserEditedSL(true);
    }
    if (field === 'takeProfit') {
      setHasUserEditedTP(true);
    }
    setError(null);
    setSuccess(null);
  };

  const handleOrderBookPriceSelect = (price: string) => {
    handleInputChange("price", price);
    setOrderBookPrice(price);
  };

  const handleSliderChange = (value: number[]) => {
    let percentage = value[0];
    if (isExponentialSlider) {
      // Map slider (0-100) to percentage (0-100) exponentially
      // y = 100 * (x/100)^2
      percentage = 100 * Math.pow(value[0] / 100, 2);
    }
    // Round to integer
    percentage = Math.round(percentage);
    
    setPositionSizePercentage(percentage);
    setQuickQuantity(percentage);
  };

  const handleSliderCommit = (value: number[]) => {
    let percentage = value[0];
    if (isExponentialSlider) {
      percentage = 100 * Math.pow(value[0] / 100, 2);
      // No snapping for exponential mode to allow fine control
      const rounded = Math.round(percentage);
      setPositionSizePercentage(rounded);
      setQuickQuantity(rounded);
    } else {
      // Snap to nearest 10% on commit (mouse up / click) for linear mode
      const snapped = Math.round(percentage / 10) * 10;
      setPositionSizePercentage(snapped);
      setQuickQuantity(snapped);
    }
  };

  const calculateOrderValue = () => {
    const qty = parseFloat(orderForm.quantity) || 0;
    const price =
      orderForm.type === "MARKET"
        ? currentPrice
        : parseFloat(orderForm.price) || 0;
    return (qty * price).toFixed(2);
  };

  const calculateLiquidationPrice = () => {
    const leverage = parseFloat(orderForm.leverage) || 1;
    const entryPrice =
      orderForm.type === "MARKET"
        ? currentPrice
        : parseFloat(orderForm.price) || currentPrice;
    const quantity = parseFloat(orderForm.quantity) || 0;
    
    if (entryPrice <= 0 || leverage <= 0) return "N/A";
    
    // Calculate position value
    const positionValue = entryPrice * quantity;
    
    // Maintenance Margin Rate (MMR) - Binance uses tiered rates based on position size
    // Simplified: 0.4% for positions < $50k, 0.5% for $50k-$250k, increasing for larger positions
    let mmr = 0.004; // 0.4% default
    if (positionValue >= 250000) mmr = 0.01;
    else if (positionValue >= 50000) mmr = 0.005;
    
    // Initial Margin (IM) = 1/leverage
    const im = 1 / leverage;
    
    // Liquidation Price Formula:
    // For LONG: Liq Price = Entry * (1 - IM + MMR)
    // For SHORT: Liq Price = Entry * (1 + IM - MMR)
    // Note: This is simplified. Full formula includes accumulated funding, wallet balance, etc.
    
    if (orderForm.side === "BUY") {
      // Long position
      const liqPrice = entryPrice * (1 - im + mmr);
      return liqPrice > 0 ? liqPrice.toFixed(calculatePriceDecimals(entryPrice)) : "N/A";
    } else {
      // Short position
      const liqPrice = entryPrice * (1 + im - mmr);
      return liqPrice.toFixed(calculatePriceDecimals(entryPrice));
    }
  };

  // Calculate risked amount based on stop loss
  const calculateRiskedAmount = useMemo(() => {
    const qty = parseFloat(orderForm.quantity) || 0;
    const entryPrice =
      orderForm.type === "MARKET"
        ? currentPrice
        : parseFloat(orderForm.price) || currentPrice;
    const slPrice = parseFloat(orderForm.stopLoss) || 0;

    if (qty <= 0 || entryPrice <= 0 || slPrice <= 0) {
      return { amount: 0, percentage: 0 };
    }

    let priceDiff: number;
    if (orderForm.side === "BUY") {
      priceDiff = entryPrice - slPrice;
    } else {
      priceDiff = slPrice - entryPrice;
    }

    const riskAmount = Math.abs(priceDiff * qty);
    const riskPercentage = availableBalance > 0 ? (riskAmount / availableBalance) * 100 : 0;

    return { amount: riskAmount, percentage: riskPercentage };
  }, [orderForm.quantity, orderForm.price, orderForm.stopLoss, orderForm.side, orderForm.type, currentPrice, availableBalance]);

  const setQuickQuantity = (percentage: number) => {
    if (availableBalance > 0 && currentPrice > 0) {
      const leverage = parseFloat(orderForm.leverage) || 1;
      const maxPositionValue = availableBalance * leverage;
      const rawQuantity = (maxPositionValue / currentPrice) * (percentage / 100);
      const quantity = roundToStep(rawQuantity, stepSize);
      handleInputChange("quantity", quantity);
    } else {
      // Fallback if balance not available
      const baseAmount = 1000;
      const rawQuantity = (baseAmount / currentPrice) * (percentage / 100);
      const quantity = roundToStep(rawQuantity, stepSize);
      handleInputChange("quantity", quantity);
    }
  };

  const submitOrder = async () => {
    if (!orderForm.accountId) {
      setError("Please select a trading account");
      return;
    }

    if (!orderForm.quantity || parseFloat(orderForm.quantity) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    // Mandatory Stop Loss check
    if (!orderForm.stopLoss || parseFloat(orderForm.stopLoss) <= 0) {
      setError("Stop Loss is mandatory for risk management");
      return;
    }

    if (
      orderForm.type === "LIMIT" &&
      (!orderForm.price || parseFloat(orderForm.price) <= 0)
    ) {
      setError("Please enter a valid price");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderData = {
        accountId: orderForm.accountId,
        symbol: symbol,
        side: orderForm.side,
        type: orderForm.type,
        quantity: parseFloat(orderForm.quantity),
        ...(orderForm.type === "LIMIT" && {
          price: parseFloat(orderForm.price),
        }),
        ...(orderForm.type.includes("STOP") && {
          stopPrice: parseFloat(orderForm.stopPrice),
        }),
        reduceOnly: orderForm.reduceOnly,
        leverage: parseFloat(orderForm.leverage),
        stopLoss: parseFloat(orderForm.stopLoss),
        takeProfit: orderForm.takeProfit
          ? parseFloat(orderForm.takeProfit)
          : undefined,
      };

      const response = await api.post(
        "/orders/place",
        orderData
      );

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to place order");
      }

      setSuccess(
        `${orderForm.side} order placed successfully for ${orderForm.quantity} ${symbol}`
      );
      onOrderPlaced();
      setOrderRefreshTrigger(prev => prev + 1); // Trigger refresh of positions/orders tabs

      // Reset form
      setOrderForm((prev) => ({
        ...prev,
        quantity: "0.001",
        price: currentPrice.toFixed(tickSize.includes('.') ? tickSize.split('.')[1].replace(/0+$/, '').length : 2),
        stopPrice: "",
        stopLoss: "",
        takeProfit: "",
      }));
      setPositionSizePercentage(0);
    } catch (err: any) {
      // eslint-disable-next-line no-console -- surfaced during order error handling
      console.error("Order placement error:", err);
      const errorData = err.response?.data;
      const errorMessage = errorData?.details || errorData?.error || err.message || "Failed to place order";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="trading-window-empty">
        <p>No trading accounts available</p>
      </div>
    );
  }

  // Build price lines for the chart
  const chartPriceLines = [];
  
  // Order price line (for limit orders)
  if (orderForm.type === "LIMIT" && orderForm.price) {
    const price = parseFloat(orderForm.price);
    if (price > 0) {
      chartPriceLines.push({
        price,
        color: orderForm.side === "BUY" ? "#22c55e" : "#ef4444", // Green for buy, red for sell
        lineWidth: 2,
        lineStyle: 0, // Solid
        title: `${orderForm.side} @ ${formatPrice(price, "$")}`,
      });
    }
  }
  
  // Stop Loss line
  if (orderForm.stopLoss) {
    const slPrice = parseFloat(orderForm.stopLoss);
    if (slPrice > 0) {
      chartPriceLines.push({
        price: slPrice,
        color: "#f97316", // Orange
        lineWidth: 1,
        lineStyle: 2, // Dashed
        title: `SL ${formatPrice(slPrice, "$")}`,
      });
    }
  }
  
  // Take Profit line
  if (orderForm.takeProfit) {
    const tpPrice = parseFloat(orderForm.takeProfit);
    if (tpPrice > 0) {
      chartPriceLines.push({
        price: tpPrice,
        color: "#3b82f6", // Blue
        lineWidth: 1,
        lineStyle: 2, // Dashed
        title: `TP ${formatPrice(tpPrice, "$")}`,
      });
    }
  }

  return (
    <div className="trading-window">
      <MultiTimeframeChart
        symbol={symbol}
        accountId={orderForm.accountId}
        accountType={
          accounts.find((a) => a._id === orderForm.accountId)?.accountType
        }
        marketType={marketType}
        priceLines={chartPriceLines}
      />
      <div className="trading-header">
        <h3>{symbol} Trading</h3>
        <div className="trading-header-actions">
          <div className="current-price">${currentPrice.toFixed(2)}</div>
          <div className="refresh-controls">
            {lastDetailsRefresh && (
              <span className="last-refresh-time">
                Updated {new Date(lastDetailsRefresh).toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="refresh-details-button"
              onClick={() => fetchAccountAndPositionDetails()}
              disabled={!selectedAccount || isRefreshingDetails}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${isRefreshingDetails ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="trading-content">
        <TooltipProvider>
          <div className="trading-form">
            {/* Position Sizing Slider */}
            <div className="form-group mb-4">
              <div className="flex justify-between items-center mb-1">
                <label className="mb-0">Position Size: <span className="slider-value-display">{positionSizePercentage}%</span></label>
                <div className="flex items-center gap-1.5">
                  <input 
                    type="checkbox" 
                    id="expSlider" 
                    checked={isExponentialSlider} 
                    onChange={(e) => setIsExponentialSlider(e.target.checked)} 
                    className="form-checkbox w-3 h-3"
                  />
                  <label htmlFor="expSlider" className="text-[10px] cursor-pointer text-muted-foreground mb-0">Exp. Spacing</label>
                </div>
              </div>
              <div className="slider-wrapper">
                <Slider
                  value={[
                    isExponentialSlider 
                      ? 100 * Math.sqrt(positionSizePercentage / 100) 
                      : positionSizePercentage
                  ]}
                  onValueChange={handleSliderChange}
                  onValueCommit={handleSliderCommit}
                  max={100}
                  step={1}
                  className="position-slider"
                />
              </div>
              <div className="slider-labels">
                <span
                  className="cursor-pointer hover:text-primary"
                  onClick={() => handleSliderCommit([0])}
                >
                  0%
                </span>
                <span
                  className="cursor-pointer hover:text-primary"
                  onClick={() => handleSliderCommit([20])}
                >
                  {isExponentialSlider ? "4%" : "20%"}
                </span>
                <span
                  className="cursor-pointer hover:text-primary"
                  onClick={() => handleSliderCommit([40])}
                >
                  {isExponentialSlider ? "16%" : "40%"}
                </span>
                <span
                  className="cursor-pointer hover:text-primary"
                  onClick={() => handleSliderCommit([60])}
                >
                  {isExponentialSlider ? "36%" : "60%"}
                </span>
                <span
                  className="cursor-pointer hover:text-primary"
                  onClick={() => handleSliderCommit([80])}
                >
                  {isExponentialSlider ? "64%" : "80%"}
                </span>
                <span
                  className="cursor-pointer hover:text-primary"
                  onClick={() => handleSliderCommit([100])}
                >
                  100%
                </span>
              </div>
            </div>

            {/* Two Column Grid */}
            <div className="form-grid">
              {/* Order Type */}
              <div className="form-group">
                <label>Type</label>
                <select
                  value={orderForm.type}
                  onChange={(e) => handleInputChange("type", e.target.value as any)}
                  className="form-select"
                >
                  <option value="MARKET">Market</option>
                  <option value="LIMIT">Limit</option>
                  <option value="STOP_MARKET">Stop Market</option>
                  <option value="TAKE_PROFIT_MARKET">Take Profit Mkt</option>
                </select>
              </div>

              {/* Quantity */}
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  value={orderForm.quantity}
                  onChange={(e) => handleInputChange("quantity", e.target.value)}
                  className="form-input"
                  placeholder="0.001"
                  step={stepSize}
                />
              </div>

              {/* Price (for limit orders) */}
              {orderForm.type === "LIMIT" ? (
                <div className="form-group">
                  <label>Price</label>
                  <input
                    type="number"
                    value={orderForm.price}
                    onChange={(e) => handleInputChange("price", e.target.value)}
                    className="form-input"
                    placeholder={currentPrice.toFixed(2)}
                    step={tickSize}
                  />
                </div>
              ) : (
                <div className="form-group flex flex-row items-center gap-2">
                  <label className="mb-0 text-xs font-semibold whitespace-nowrap">Reduce Only</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">
                        When enabled, this order will only reduce your existing position, not increase it.
                        Useful for closing positions without accidentally opening a new one.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex items-center gap-1.5 ml-2">
                    <input
                      type="checkbox"
                      id="reduceOnly"
                      checked={orderForm.reduceOnly}
                      onChange={(e) =>
                        handleInputChange("reduceOnly", e.target.checked)
                      }
                      className="form-checkbox w-3.5 h-3.5"
                    />
                    <label htmlFor="reduceOnly" className="mb-0 text-xs cursor-pointer">Yes</label>
                  </div>
                </div>
              )}

              {/* Stop Loss with Risk Amount */}
              <div className="form-group">
                <label>Stop Loss *</label>
                <input
                  type="number"
                  value={orderForm.stopLoss}
                  onChange={(e) => handleInputChange("stopLoss", e.target.value)}
                  className="form-input"
                  placeholder="SL Price"
                  step={tickSize}
                  required
                />
                {calculateRiskedAmount.amount > 0 && (
                  <div className={`risk-amount ${calculateRiskedAmount.percentage > 5 ? 'risk-high' : 'risk-normal'}`}>
                    Risk: ${calculateRiskedAmount.amount.toFixed(2)} ({calculateRiskedAmount.percentage.toFixed(1)}%)
                  </div>
                )}
              </div>

              {/* Take Profit */}
              <div className="form-group">
                <label>Take Profit</label>
                <input
                  type="number"
                  value={orderForm.takeProfit}
                  onChange={(e) => handleInputChange("takeProfit", e.target.value)}
                  className="form-input"
                  placeholder="TP Price"
                  step={tickSize}
                />
              </div>

              {/* Reduce Only when Limit is selected */}
              {orderForm.type === "LIMIT" && (
                <div className="form-group flex flex-row items-center gap-2">
                  <label className="mb-0 text-xs font-semibold whitespace-nowrap">Reduce Only</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">
                        When enabled, this order will only reduce your existing position, not increase it.
                        Useful for closing positions without accidentally opening a new one.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex items-center gap-1.5 ml-2">
                    <input
                      type="checkbox"
                      id="reduceOnlyLimit"
                      checked={orderForm.reduceOnly}
                      onChange={(e) =>
                        handleInputChange("reduceOnly", e.target.checked)
                      }
                      className="form-checkbox w-3.5 h-3.5"
                    />
                    <label htmlFor="reduceOnlyLimit" className="mb-0 text-xs cursor-pointer">Yes</label>
                  </div>
                </div>
              )}
            </div>

            {/* Slider and Summary Grid */}
            <div className="form-grid">
              {/* Order Summary */}
              <div className="order-summary">
                <div className="summary-row">
                  <span>Order Value:</span>
                  <span>${calculateOrderValue()}</span>
                </div>
                <div className="summary-row">
                  <span>Liquidation Price:</span>
                  <span>${calculateLiquidationPrice()}</span>
                </div>
                <div className="summary-row">
                  <span>Available:</span>
                  <span>${availableBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Error/Success Messages */}
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            {/* Submit Button */}
            <Button
              variant={orderForm.side === "BUY" ? "success" : "danger"}
              size="sm"
              disabled={isSubmitting}
              onClick={submitOrder}
              className="w-full"
            >
              {isSubmitting ? "Placing Order..." : `${orderForm.side} ${symbol}`}
            </Button>
          </div>
        </TooltipProvider>

        {/* Right Side - Account Info and Position Details */}
        <div className="trading-info-panel">
          {/* Order Side - At Top of Info Panel */}
          <div className="form-group full-width mb-4">
            <label>Side</label>
            <div className="button-group">
              <Button
                type="button"
                variant={orderForm.side === "BUY" ? "success" : "outline"}
                size="sm"
                onClick={() => handleInputChange("side", "BUY")}
              >
                Buy
              </Button>
              <Button
                type="button"
                variant={orderForm.side === "SELL" ? "danger" : "outline"}
                size="sm"
                onClick={() => handleInputChange("side", "SELL")}
              >
                Sell
              </Button>
            </div>
          </div>

          {/* Config Section */}
          <div className="bg-card p-3 rounded-md text-xs space-y-1.5 border shadow-sm">
            <div className="font-medium text-muted-foreground mb-2 text-[1rem]">
              Config
            </div>
            <div className="space-y-3">
              {/* Leverage Slider */}
              <div className="form-group mb-0">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-muted-foreground mb-0">Leverage</label>
                  <span className="text-[10px] font-medium text-primary">{orderForm.leverage}x</span>
                </div>
                <Slider
                  value={[parseInt(orderForm.leverage) || 1]}
                  min={1}
                  max={maxLeverage}
                  step={1}
                  onValueChange={(value) => handleInputChange("leverage", String(value[0]))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>1x</span>
                  <span>{maxLeverage}x</span>
                </div>
              </div>

              <div className="form-group mb-0">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-muted-foreground">Max Lev.</span>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs"><strong>Maximum Leverage</strong></p>
                        <p className="text-xs text-muted-foreground">The maximum leverage multiplier to use for your trades. Higher leverage = higher risk.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <input
                  type="number"
                  value={userMaxLeverage}
                  onChange={(e) => handleUserMaxLeverageChange(parseInt(e.target.value) || 1)}
                  className="form-input w-full text-left px-2 py-1 h-7 text-xs"
                  min="1"
                  max="125"
                  step="1"
                />
              </div>
              <div className="form-group mb-0">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-muted-foreground">Def. Risk (%)</span>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs"><strong>Default Risk Percentage</strong></p>
                        <p className="text-xs text-muted-foreground">The percentage of your account balance you're willing to risk per trade. Used to auto-calculate stop loss price.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={defaultRiskPercent}
                    onChange={(e) => handleDefaultRiskChange(e.target.value)}
                    className="form-input w-full text-left px-2 py-1 h-7 text-xs"
                    placeholder="1"
                    min="0.1"
                    max="100"
                    step="0.1"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {defaultRiskAmount !== null ? `≈ $${defaultRiskAmount.toFixed(2)}` : ""}
                  </span>
                </div>
              </div>
              <div className="form-group mb-0">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-muted-foreground">Def. TP (%)</span>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs"><strong>Default Take Profit %</strong></p>
                        <p className="text-xs text-muted-foreground">Optional: Default percentage gain for take profit. Auto-calculates TP price based on entry. Leave empty to disable.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={defaultTakeProfitPercent}
                    onChange={(e) => handleDefaultTakeProfitChange(e.target.value)}
                    className="form-input w-full text-left px-2 py-1 h-7 text-xs"
                    placeholder="e.g. 2"
                    min="0"
                    max="100"
                    step="0.5"
                  />
                  <button
                    type="button"
                    onClick={() => handleDefaultTakeProfitChange("")}
                    className="text-muted-foreground hover:text-destructive text-xs px-1"
                    title="Clear TP value"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 h-7 text-xs"
              onClick={() => {
                // All config values are already saved to localStorage on change
                // This button provides visual feedback
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md text-sm z-50 animate-fade-in';
                toast.textContent = 'Config saved!';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2000);
              }}
            >
              Save Config
            </Button>
          </div>

          {/* Account Details */}
          {accountDetails && (
            <div className="bg-card p-3 rounded-md text-xs space-y-1.5 border shadow-sm">
              <div className="font-medium text-muted-foreground mb-1 text-[1rem]">
                Account Info
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Margin Ratio</span>
                <span
                  className={
                    accountDetails.marginRatio > 80
                      ? "text-red-500 font-medium"
                      : "text-green-500 font-medium"
                  }
                >
                  {formatPercent(accountDetails.marginRatio)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Maint. Margin</span>
                <span>${formatPrice(accountDetails.maintenanceMargin)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Equity</span>
                <span className="font-medium">
                  ${formatPrice(accountDetails.equity)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Available</span>
                <span>${formatPrice(accountDetails.availableBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Position Value</span>
                <span>${formatPrice(accountDetails.positionValue)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Actual Leverage</span>
                <span>{accountDetails.actualLeverage?.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Unrealized PNL</span>
                <span
                  className={
                    accountDetails.unrealizedPNL >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  }
                >
                  ${formatPrice(accountDetails.unrealizedPNL)}
                </span>
              </div>
            </div>
          )}


        </div>

        {/* Order Book - Rightmost Column */}
        <div className="market-depth-panel">
          <MarketDepth
            symbol={symbol}
            currentPrice={currentPrice}
            onPriceSelect={handleOrderBookPriceSelect}
            accountType={selectedAccount?.accountType}
            marketType={
              marketType === "futures" ? "binance-futures" : "binance-spot"
            }
          />
        </div>
      </div>

      {/* Positions, Orders, History Tabs */}
      <div className="px-2 mt-3">
        <TradingPanelTabs
          selectedAccount={selectedAccount}
          symbol={symbol}
          refreshTrigger={orderRefreshTrigger}
          orderBookPrice={orderBookPrice}
          onOrderBookPriceApplied={() => setOrderBookPrice(null)}
          onSymbolSelect={onSymbolSelect}
        />
      </div>

      {/* Spacer to allow scrolling the form up */}
      <div className="h-[25vh] w-full shrink-0" />

      <style>{`
        .trading-window {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .trading-window-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          font-size: 0.9rem;
        }

        .trading-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #e9ecef;
          background: #ffffff;
          color: #333;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .dark .trading-header {
          border-bottom: 1px solid #27272a !important;
          background: #18181b !important;
          color: #ffffff !important;
        }

        .trading-header h3 {
          margin: 0;
          font-size: 1rem;
          color: var(--foreground);
        }

        .trading-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .refresh-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .current-price {
          font-weight: 600;
          font-size: 1rem;
          color: #2196f3;
        }

        .last-refresh-time {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .dark .last-refresh-time {
          color: #a1a1aa;
        }

        .trading-content {
          display: flex;
          flex-shrink: 0;
          gap: 0; /* Remove gap, handle with padding/borders */
          align-items: flex-start;
          border-bottom: 1px solid #e9ecef;
        }

        .dark .trading-content {
          border-bottom: 1px solid #27272a;
        }

        .market-depth-panel {
          flex: 0 0 220px;
          max-width: 220px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-left: 1px solid #e9ecef;
          background: #ffffff;
        }

        .dark .market-depth-panel {
          border-left: 1px solid #27272a;
          background: #09090b;
        }

        .trading-form {
          flex: 1;
          min-width: 320px;
          padding: 16px;
          background: #ffffff;
          border-right: 1px solid #e9ecef;
        }

        .dark .trading-form {
          background: #09090b !important;
          border-right: 1px solid #27272a;
        }

        .trading-info-panel {
          flex: 0 0 240px;
          max-width: 240px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          background: #f8f9fa;
          border-right: 1px solid #e9ecef;
        }

        .dark .trading-info-panel {
          background: #18181b;
          border-right: 1px solid #27272a;
        }

        .max-lev-group {
          display: flex;
          align-items: center;
          justify-content: flex-start !important;
          width: 100%;
          gap: 8px;
          margin-bottom: 0;
          margin-left: 0;
          padding-left: 0;
          padding-bottom: 12px;
          border-bottom: 1px solid #e9ecef;
        }

        .dark .max-lev-group {
          border-bottom: 1px solid #27272a;
        }

        .max-lev-group label {
          margin-bottom: 0 !important;
          white-space: nowrap;
          font-size: 0.85rem;
          text-align: left;
        }

        .max-lev-input {
          width: 70px !important;
          text-align: left !important;
          padding-left: 8px !important;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 16px;
          margin-bottom: 16px;
        }

        .form-group {
          margin-bottom: 0;
        }

        .form-group.full-width {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .label-with-tooltip {
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }

        .tooltip-icon {
          width: 12px;
          height: 12px;
          color: var(--muted-foreground);
          cursor: help;
        }

        .tooltip-icon:hover {
          color: var(--foreground);
        }

        .risk-amount {
          font-size: 0.75rem;
          margin-top: 2px;
          padding: 2px 4px;
          border-radius: 2px;
        }

        .risk-normal {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
        }

        .risk-high {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }

        .form-input,
        .form-select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.9rem;
          background: #ffffff;
          color: #333;
          height: 36px;
        }

        .dark .form-input,
        .dark .form-select {
          border: 1px solid #27272a !important;
          background: #18181b !important;
          color: #ffffff !important;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #2196f3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
        }

        .button-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .slider-wrapper {
          padding: 12px 0;
        }

        .position-slider {
          height: 24px;
        }

        .position-slider [data-radix-slider-track] {
          height: 6px;
        }

        .position-slider [data-radix-slider-thumb] {
          width: 20px;
          height: 20px;
        }

        .slider-value-display {
          font-weight: 700;
          color: var(--primary);
        }

        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--muted-foreground);
          margin-top: 2px;
          padding: 4px 0;
        }

        .slider-labels span {
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.15s;
        }

        .slider-labels span:hover {
          background-color: var(--accent);
        }

        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 0;
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .form-checkbox {
          width: 14px;
          height: 14px;
          cursor: pointer;
        }

        .checkbox-label {
          cursor: pointer;
          font-size: 0.8rem;
          margin: 0;
        }

        .order-summary {
          background: #f8f9fa;
          color: #333;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #e9ecef;
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: 100%;
        }

        .dark .order-summary {
          background: #27272a !important;
          color: #ffffff !important;
          border: 1px solid #3f3f46;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.875rem;
          margin-bottom: 4px;
        }

        .summary-row:last-child {
          margin-bottom: 0;
        }

        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 5px 8px;
          border-radius: 4px;
          font-size: 0.85rem;
          margin-bottom: 8px;
        }

        .dark .error-message {
          background: #450a0a;
          color: #fca5a5;
        }

        .success-message {
          background: #e8f5e8;
          color: #2e7d32;
          padding: 5px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          margin-bottom: 8px;
        }

        .dark .success-message {
          background: #052e16;
          color: #86efac;
        }

        /* Mobile Responsive Styles */
        @media (max-width: 768px) {
          .trading-content {
            flex-direction: column;
            align-items: stretch;
          }

          .trading-form {
            flex: 1;
            max-width: 100%;
            border-right: none;
            padding: 8px;
          }

          .trading-info-panel {
            flex: 1;
            max-width: 100%;
            padding: 8px;
            border-right: none;
          }

          .market-depth-panel {
            flex: 1;
            max-width: 100%;
            border-left: none;
          }

          .form-grid {
            grid-template-columns: 1fr;
            gap: 6px;
            margin-bottom: 8px;
          }
          
          .trading-header {
            padding: 4px 8px;
          }

          .trading-header h3 {
            font-size: 0.85rem;
          }

          .current-price {
            font-size: 0.85rem;
          }

          .trading-header-actions {
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
          }

          .refresh-controls {
            flex-wrap: wrap;
            justify-content: flex-end;
          }

          /* Stack order summary below slider on mobile to reduce whitespace */
          .form-grid {
            display: flex;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
});

export default TradingWindow;
