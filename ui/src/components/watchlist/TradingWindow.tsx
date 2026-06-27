"use client";

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
import { useTradingData } from "@/contexts/trading-data-context";
import { useAuth } from "@/contexts/auth-context";
import { useDebouncedCallback } from "@/lib/use-debounce";
import { AlertTriangle, HelpCircle, RefreshCw, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MarketDepth from "./MarketDepth";
import MultiTimeframeChart from "./MultiTimeframeChart";
import TradingPanelTabs from "./TradingPanelTabs";

interface TradingWindowProps {
  symbol: string;
  currentPrice: number;
  accounts: Array<{
    _id: string;
    accountName: string;
    accountType: "binance" | "upstox";
    isActive: boolean;
    isDemo?: boolean;
  }>;
  selectedAccount?: {
    _id: string;
    accountName: string;
    accountType: "binance" | "upstox";
    isActive: boolean;
    isDemo?: boolean;
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

interface RetryState {
  symbol: string;
  quantity: number;
  originalSide: "BUY" | "SELL";
  originalType: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  slPrice?: number;
  tpPrice?: number;
  failedTypes: ("sl_failed" | "tp_failed")[];
}

const DETAILS_REFRESH_INTERVAL = 60000; // 60 seconds between automatic refreshes
const LOGARITHMIC_SLIDER_STORAGE_KEY = "spikeyCoins_isExponentialSlider"; // key kept for backward compat
const DEFAULT_RISK_PERCENT_STORAGE_KEY = "spikeyCoins_defaultRiskPercent";
const DEFAULT_TP_PERCENT_STORAGE_KEY = "spikeyCoins_defaultTakeProfitPercent";
const USER_MAX_LEVERAGE_STORAGE_KEY = "spikeyCoins_userMaxLeverage";
const USE_SL_TP_SLIDER_STORAGE_KEY = "spikeyCoins_useSlTpSlider";
const SYMBOL_LEVERAGES_STORAGE_KEY = "spikeyCoins_symbolLeverages";

export function useTradingWindow({
  symbol,
  currentPrice,
  accounts,
  selectedAccount,
  onOrderPlaced,
}: TradingWindowProps) {
  // Use shared trading data context
  const {
    orders: contextOrders,
    accountDetails: contextAccountDetails,
    symbolInfo: contextSymbolInfo,
    existingPosition: contextExistingPosition,
    refreshAll: contextRefreshAll,
    setActiveSymbol,
    loading: contextLoading,
    lastRefresh: contextLastRefresh,
  } = useTradingData();

  // Check if user is authenticated for demo trading restrictions
  const { isLoggedIn } = useAuth();

  // Helper to check if demo trading is blocked (demo account + not authenticated)
  const isDemoTradingBlocked = selectedAccount?.isDemo && !isLoggedIn;

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

  const [positionSizePercentage, setPositionSizePercentage] = useState(1);
  // Track the last percentage that was applied to quantity, so the effect fires on mount (initial value of 1)
  const lastAppliedPercentage = useRef<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [hasUserEditedSL, setHasUserEditedSL] = useState(false);
  const [hasUserEditedTP, setHasUserEditedTP] = useState(false);
  const [hasUserEditedPrice, setHasUserEditedPrice] = useState(false);
  const [slAutoCalcWarning, setSlAutoCalcWarning] = useState<string | null>(null);
  const [accountDetails, setAccountDetails] = useState<any>(null);
  const [exchangeMaxLeverage, setExchangeMaxLeverage] = useState<number>(125);
  const [tickSize, setTickSize] = useState<string>("0.01");
  const [stepSize, setStepSize] = useState<string>("0.001");
  const [minQty, setMinQty] = useState<number>(0);
  const [minNotional, setMinNotional] = useState<number>(0);
  const [isLogarithmicSlider, setIsLogarithmicSlider] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOGARITHMIC_SLIDER_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [useSlTpSlider, setUseSlTpSlider] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(USE_SL_TP_SLIDER_STORAGE_KEY);
      return stored !== null ? stored === "true" : true; // Default to true (slider mode)
    } catch {
      return true;
    }
  });
  // Slider percentage values for SL/TP (% of available balance)
  const [slPercentage, setSlPercentage] = useState<number>(1);
  const [tpPercentage, setTpPercentage] = useState<number>(2);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);
  // isRefreshingDetails replaced with contextLoading from useTradingData
  const isRefreshingDetails = contextLoading;
  const [orderBookPrice, setOrderBookPrice] = useState<string | null>(null);
  const [existingPosition, setExistingPosition] = useState<{
    size: number;
    entryPrice: number;
    pnl: number;
    leverage: number;
  } | null>(null);
  const [openOrders, setOpenOrders] = useState<Array<{
    id: string;
    symbol: string;
    price: number;
    stopPrice?: number;
    orderType: string;
    transactionType: string;
    quantity: number;
    status: string;
  }>>([]);

  const [lastDetailsRefresh, setLastDetailsRefresh] = useState<number | null>(
    null
  );

  // Track if we've synced leverage from the exchange for the current session/symbol
  const hasSyncedLeverage = useRef(false);

  // Track slider drag state: count how many times onValueChange fires
  // A click fires once, a drag fires many times
  const sliderChangeCount = useRef(0);

  // Tell context which symbol we're working with
  useEffect(() => {
    if (symbol) {
      setActiveSymbol(symbol);
    }
  }, [symbol, setActiveSymbol]);

  // Sync all context data to local state in a single effect
  // This consolidates multiple sync effects to reduce re-render overhead
  useEffect(() => {
    // Sync orders (filter to current symbol)
    const symbolOrders = contextOrders.filter(
      (order) =>
        order.symbol === symbol &&
        (order.status === "NEW" ||
          order.status === "OPEN" ||
          order.status === "TRIGGER_PENDING" ||
          order.status === "PARTIALLY_FILLED")
    );
    setOpenOrders(symbolOrders);

    // Sync existing position from context
    if (contextExistingPosition && contextExistingPosition.symbol === symbol) {
      setExistingPosition({
        size: contextExistingPosition.size,
        entryPrice: contextExistingPosition.entryPrice,
        pnl: contextExistingPosition.pnl,
        leverage: contextExistingPosition.leverage,
      });
    } else {
      setExistingPosition(null);
    }

    // Sync account details from context
    if (contextAccountDetails) {
      setAccountDetails(contextAccountDetails);
      setAvailableBalance(contextAccountDetails.availableBalance || contextAccountDetails.equity || 0);
    }

    // Sync symbol info from context
    if (contextSymbolInfo) {
      setTickSize(contextSymbolInfo.tickSize);
      setStepSize(contextSymbolInfo.stepSize);
      setMinQty(contextSymbolInfo.minQty || 0);
      setMinNotional(contextSymbolInfo.minNotional || 0);
      setExchangeMaxLeverage(contextSymbolInfo.maxLeverage);
    }

    // Sync last refresh time
    if (contextLastRefresh) {
      setLastDetailsRefresh(contextLastRefresh);
    }
  }, [contextOrders, contextExistingPosition, contextAccountDetails, contextSymbolInfo, contextLastRefresh, symbol]);

  // Reset synced state when symbol or account changes
  useEffect(() => {
    hasSyncedLeverage.current = false;
    setHasUserEditedPrice(false);
    setHasUserEditedSL(false);
    setHasUserEditedTP(false);
    setSlAutoCalcWarning(null);
    // When user changes symbol or account, reset price to latest LTP for LIMIT orders
    if (orderForm.type === "LIMIT") {
      const decimals = tickSize.includes(".")
        ? tickSize.split(".")[1].replace(/0+$/, "").length
        : 2;
      setOrderForm((prev) => ({
        ...prev,
        price: currentPrice.toFixed(decimals),
      }));
    }
  }, [symbol, selectedAccount?._id]);

  // Keep LIMIT price in sync with live price until the user edits it.
  // This fixes cases where the field initializes from cached prices and then never updates.
  useEffect(() => {
    if (orderForm.type !== "LIMIT") return;
    if (hasUserEditedPrice) return;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

    const decimals = tickSize.includes(".")
      ? tickSize.split(".")[1].replace(/0+$/, "").length
      : 2;
    const nextPrice = currentPrice.toFixed(decimals);

    // Critical: if current price is invalid (0 or empty), ALWAYS sync to the valid currentPrice
    // This handles fresh page load when orderForm initializes with price="0.00"
    const currentPriceNum = parseFloat(orderForm.price);
    const isCurrentPriceInvalid = !Number.isFinite(currentPriceNum) || currentPriceNum <= 0;

    // Avoid churn on identical values (but always update if current price is invalid)
    if (!isCurrentPriceInvalid && orderForm.price === nextPrice) return;

    setOrderForm((prev) => {
      if (prev.type !== "LIMIT") return prev;
      const prevPriceNum = parseFloat(prev.price);
      const isPrevPriceInvalid = !Number.isFinite(prevPriceNum) || prevPriceNum <= 0;
      if (!isPrevPriceInvalid && prev.price === nextPrice) return prev;
      return { ...prev, price: nextPrice };
    });
  }, [currentPrice, tickSize, orderForm.type, orderForm.price, hasUserEditedPrice]);
  // User-defined max leverage (stored in localStorage)
  const [userMaxLeverage, setUserMaxLeverage] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(USER_MAX_LEVERAGE_STORAGE_KEY);
      return stored ? parseInt(stored, 10) : 20;
    } catch {
      return 20;
    }
  });

  // Draft config values (edited in UI, only applied on Save Config)
  const [draftUserMaxLeverage, setDraftUserMaxLeverage] =
    useState<number>(userMaxLeverage);

  // User-defined default risk percentage (default 1%)
  const [defaultRiskPercent, setDefaultRiskPercent] = useState<string>(() => {
    return localStorage.getItem(DEFAULT_RISK_PERCENT_STORAGE_KEY) || "1";
  });

  const [draftDefaultRiskPercent, setDraftDefaultRiskPercent] =
    useState<string>(defaultRiskPercent);

  // Derived: current default risk amount in dollars (if balance known)
  const defaultRiskAmount = useMemo(() => {
    const pct = parseFloat(draftDefaultRiskPercent || "0");
    if (!availableBalance || isNaN(pct) || pct <= 0) return null;
    return (availableBalance * pct) / 100;
  }, [availableBalance, draftDefaultRiskPercent]);

  // User-defined default take profit percentage (optional)
  const [defaultTakeProfitPercent, setDefaultTakeProfitPercent] =
    useState<string>(() => {
      return localStorage.getItem(DEFAULT_TP_PERCENT_STORAGE_KEY) || "";
    });

  const [draftDefaultTakeProfitPercent, setDraftDefaultTakeProfitPercent] =
    useState<string>(defaultTakeProfitPercent);

  // Effective max leverage is min of exchange max and user max
  const maxLeverage = Math.min(exchangeMaxLeverage, userMaxLeverage);

  // Helper functions for per-symbol leverage persistence
  const getStoredLeverageForSymbol = (symbol: string): number | null => {
    try {
      const stored = localStorage.getItem(SYMBOL_LEVERAGES_STORAGE_KEY);
      if (!stored) return null;
      const leverages = JSON.parse(stored);
      return leverages[symbol] || null;
    } catch {
      return null;
    }
  };

  const setStoredLeverageForSymbol = (symbol: string, leverage: number): void => {
    try {
      const stored = localStorage.getItem(SYMBOL_LEVERAGES_STORAGE_KEY);
      const leverages = stored ? JSON.parse(stored) : {};
      leverages[symbol] = leverage;
      localStorage.setItem(SYMBOL_LEVERAGES_STORAGE_KEY, JSON.stringify(leverages));
    } catch {
      // Ignore storage errors
    }
  };

  // Helper to round value to nearest step size
  const roundToStep = (value: number, step: string): string => {
    const stepNum = parseFloat(step);
    if (stepNum <= 0 || isNaN(stepNum)) return value.toFixed(8);
    const decimals = step.includes(".")
      ? step.split(".")[1].replace(/0+$/, "").length
      : 0;
    const rounded = Math.round(value / stepNum) * stepNum;
    return rounded.toFixed(decimals);
  };

  const handleUserMaxLeverageChange = (value: number) => {
    setDraftUserMaxLeverage(value);
  };

  const handleDefaultRiskChange = (value: string) => {
    setDraftDefaultRiskPercent(value);
  };

  const handleDefaultTakeProfitChange = (value: string) => {
    setDraftDefaultTakeProfitPercent(value);
  };

  const applyConfig = () => {
    const nextUserMax = Number.isFinite(draftUserMaxLeverage)
      ? Math.max(1, draftUserMaxLeverage)
      : userMaxLeverage;

    setUserMaxLeverage(nextUserMax);
    setDraftUserMaxLeverage(nextUserMax);
    try {
      localStorage.setItem(USER_MAX_LEVERAGE_STORAGE_KEY, String(nextUserMax));
    } catch {
      // ignore
    }

    // Also update form leverage if current is higher than new max
    const effectiveMax = Math.min(exchangeMaxLeverage, nextUserMax);
    if (parseInt(orderForm.leverage) > effectiveMax) {
      setOrderForm((prev) => ({ ...prev, leverage: String(effectiveMax) }));
    }

    // Also update stored leverage for current symbol if it exceeds new max
    const storedLeverage = getStoredLeverageForSymbol(symbol);
    if (storedLeverage !== null && storedLeverage > effectiveMax) {
      setStoredLeverageForSymbol(symbol, effectiveMax);
    }

    const risk = (draftDefaultRiskPercent ?? "").trim();
    setDefaultRiskPercent(risk || "");
    setDraftDefaultRiskPercent(risk);
    try {
      if (risk) {
        localStorage.setItem(DEFAULT_RISK_PERCENT_STORAGE_KEY, risk);
      } else {
        localStorage.removeItem(DEFAULT_RISK_PERCENT_STORAGE_KEY);
      }
    } catch {
      // ignore
    }

    const tp = (draftDefaultTakeProfitPercent ?? "").trim();
    setDefaultTakeProfitPercent(tp || "");
    setDraftDefaultTakeProfitPercent(tp);
    try {
      if (tp) {
        localStorage.setItem(DEFAULT_TP_PERCENT_STORAGE_KEY, tp);
      } else {
        localStorage.removeItem(DEFAULT_TP_PERCENT_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  };

  // Dirty flag: true when any draft value differs from saved value
  const isConfigDirty = useMemo(() => {
    return (
      draftUserMaxLeverage !== userMaxLeverage ||
      draftDefaultRiskPercent !== defaultRiskPercent ||
      draftDefaultTakeProfitPercent !== defaultTakeProfitPercent
    );
  }, [
    draftUserMaxLeverage,
    userMaxLeverage,
    draftDefaultRiskPercent,
    defaultRiskPercent,
    draftDefaultTakeProfitPercent,
    defaultTakeProfitPercent,
  ]);

  // Helper to calculate decimals from price
  const calculatePriceDecimals = (price: number): number => {
    if (tickSize) {
      if (tickSize.includes(".")) {
        return tickSize.split(".")[1].replace(/0+$/, "").length;
      }
      return 0;
    }

    // Fallback: infer decimals from the price itself
    if (!Number.isFinite(price) || price <= 0) return 2;
    const parts = price.toString().split(".");
    return parts[1] ? Math.min(8, parts[1].length) : 0;
  };

  // Helper to manually sync price field to latest currentPrice (for Refresh button)
  const syncPriceToCurrent = () => {
    if (orderForm.type !== "LIMIT") return;
    const decimals = tickSize.includes(".")
      ? tickSize.split(".")[1].replace(/0+$/, "").length
      : 2;
    setOrderForm((prev) => ({
      ...prev,
      price: currentPrice.toFixed(decimals),
    }));
  };

  // Initialize leverage when symbol changes or when we have the necessary data
  useEffect(() => {
    // Only sync leverage once per symbol session
    if (hasSyncedLeverage.current) return;

    // Need exchange max leverage to calculate effective max
    if (!exchangeMaxLeverage) return;

    // Calculate effective max leverage (min of exchange max and user max)
    const effectiveMaxLeverage = Math.min(exchangeMaxLeverage, userMaxLeverage);

    // Priority 1: Try to restore from per-symbol storage
    try {
      const stored = localStorage.getItem(SYMBOL_LEVERAGES_STORAGE_KEY);
      if (stored) {
        const leverages = JSON.parse(stored);
        const storedLeverage = leverages[symbol];
        if (storedLeverage != null) {
          // Ensure stored leverage doesn't exceed current effective max
          const safeLeverage = Math.min(storedLeverage, effectiveMaxLeverage);
          setOrderForm(prev => ({
            ...prev,
            leverage: String(safeLeverage)
          }));
          hasSyncedLeverage.current = true;
          return;
        }
      }
    } catch {
      // Fall through to default if storage read fails
    }

    // Priority 2: No stored leverage, default to effective max leverage
    setOrderForm(prev => ({
      ...prev,
      leverage: String(effectiveMaxLeverage)
    }));
    hasSyncedLeverage.current = true;
  }, [symbol, exchangeMaxLeverage, userMaxLeverage]);

  // Auto-calculate Stop Loss from saved risk % (as % of available balance)
  useEffect(() => {
    if (hasUserEditedSL) {
      setSlAutoCalcWarning(null);
      return;
    }
    if (
      !defaultRiskPercent ||
      !orderForm.quantity ||
      !availableBalance
    ) {
      return;
    }

    const riskPercent = parseFloat(defaultRiskPercent);
    const qty = parseFloat(orderForm.quantity);
    const entryPrice =
      orderForm.type === "LIMIT" ? parseFloat(orderForm.price) : currentPrice;

    if (
      isNaN(riskPercent) ||
      isNaN(qty) ||
      isNaN(entryPrice) ||
      qty === 0 ||
      riskPercent <= 0
    ) {
      return;
    }

    // Calculate risk amount as percentage of available balance
    const riskAmount = (availableBalance * riskPercent) / 100;
    const riskPerUnit = riskAmount / qty;
    let newSL = 0;

    if (orderForm.side === "BUY") {
      newSL = entryPrice - riskPerUnit;
    } else {
      newSL = entryPrice + riskPerUnit;
    }

    if (newSL > 0) {
      // Round to tick size
      const tick = parseFloat(tickSize);
      const roundedSL = Math.round(newSL / tick) * tick;

      // Only update if different to avoid loops
      if (
        Math.abs(roundedSL - parseFloat(orderForm.stopLoss || "0")) >
        Number.EPSILON
      ) {
        setOrderForm((prev) => ({
          ...prev,
          stopLoss: roundedSL.toFixed(calculatePriceDecimals(entryPrice)),
        }));

        // Sync slider percentage to match the auto-calculated SL price (% of balance)
        const riskAmountFromSL = Math.abs(entryPrice - roundedSL) * qty;
        const slBalancePct = availableBalance > 0 ? (riskAmountFromSL / availableBalance) * 100 : 1;
        setSlPercentage(Math.min(100, Math.max(0.1, slBalancePct)));
      }
      setSlAutoCalcWarning(null);
    } else {
      // SL calculation resulted in invalid (negative or zero) price
      setSlAutoCalcWarning(
        `Auto SL not set: ${riskPercent}% risk with qty ${qty} exceeds price. Increase quantity or reduce risk %.`
      );
    }
  }, [
    defaultRiskPercent,
    orderForm.quantity,
    orderForm.price,
    orderForm.type,
    orderForm.side,
    currentPrice,
    tickSize,
    availableBalance,
    hasUserEditedSL,
  ]);

  // Auto-calculate Take Profit from saved TP % (as % of available balance)
  useEffect(() => {
    if (hasUserEditedTP || !defaultTakeProfitPercent) return;

    if (!availableBalance || !orderForm.quantity) return;

    const tpPercent = parseFloat(defaultTakeProfitPercent);
    const qty = parseFloat(orderForm.quantity);
    const entryPrice =
      orderForm.type === "LIMIT" ? parseFloat(orderForm.price) : currentPrice;

    if (
      isNaN(tpPercent) ||
      isNaN(entryPrice) ||
      isNaN(qty) ||
      tpPercent <= 0 ||
      entryPrice <= 0 ||
      qty <= 0
    )
      return;

    const targetAmount = (availableBalance * tpPercent) / 100;
    const priceDiff = targetAmount / qty;

    let newTP = 0;
    if (orderForm.side === "BUY") newTP = entryPrice + priceDiff;
    else newTP = entryPrice - priceDiff;

    if (newTP > 0) {
      const tick = parseFloat(tickSize);
      const roundedTP = Math.round(newTP / tick) * tick;

      // Only update if different to avoid loops
      if (
        Math.abs(roundedTP - parseFloat(orderForm.takeProfit || "0")) >
        Number.EPSILON
      ) {
        setOrderForm((prev) => ({
          ...prev,
          takeProfit: roundedTP.toFixed(calculatePriceDecimals(entryPrice)),
        }));

        // Sync slider percentage to match the auto-calculated TP price (% of balance)
        const profitAmountFromTP = Math.abs(roundedTP - entryPrice) * qty;
        const tpBalancePct = availableBalance > 0 ? (profitAmountFromTP / availableBalance) * 100 : 2;
        setTpPercentage(Math.min(100, Math.max(0.1, tpBalancePct)));
      }
    }
  }, [
    defaultTakeProfitPercent,
    orderForm.price,
    orderForm.quantity,
    orderForm.type,
    orderForm.side,
    currentPrice,
    tickSize,
    hasUserEditedTP,
    availableBalance,
  ]);

  // Compute the maximum SL percentage (of balance) that corresponds to the liquidation price
  const maxSlPercentage = useMemo(() => {
    const leverage = parseFloat(orderForm.leverage) || 1;
    const entryPrice = orderForm.type === "LIMIT"
      ? parseFloat(orderForm.price) || currentPrice
      : currentPrice;
    const qty = parseFloat(orderForm.quantity) || 0;

    if (entryPrice <= 0 || leverage <= 0 || qty <= 0 || availableBalance <= 0) return 50;

    // Simplified liquidation distance (same formula as calculateLiquidationPrice)
    const positionValue = entryPrice * qty;
    let mmr = 0.004;
    if (positionValue >= 250000) mmr = 0.01;
    else if (positionValue >= 50000) mmr = 0.005;

    const im = 1 / leverage;
    // Max price move before liquidation
    const maxPriceMove = entryPrice * (im - mmr);
    // Convert to balance percentage: loss at liquidation = maxPriceMove * qty
    const lossAtLiquidation = maxPriceMove * qty;
    const maxPct = (lossAtLiquidation / availableBalance) * 100;

    // Clamp: at least 1%, at most 100%
    return Math.max(1, Math.min(100, Math.floor(maxPct)));
  }, [orderForm.leverage, orderForm.type, orderForm.price, orderForm.quantity, currentPrice, availableBalance]);

  // Initialize SL/TP prices from slider percentages when in slider mode
  // This runs independently of quantity/balance to show prices immediately on load
  useEffect(() => {
    if (!useSlTpSlider) return; // Only for slider mode

    const entryPrice = orderForm.type === "LIMIT"
      ? parseFloat(orderForm.price) || currentPrice
      : currentPrice;
    const qty = parseFloat(orderForm.quantity) || 0;

    // Need valid entry price
    if (!entryPrice || entryPrice <= 0) return;

    const decimals = tickSize.includes(".")
      ? tickSize.split(".")[1].replace(/0+$/, "").length
      : 2;

    // Initialize SL if empty and user hasn't manually edited
    if (!hasUserEditedSL && !orderForm.stopLoss) {
      if (availableBalance > 0 && qty > 0) {
        // Balance-based: riskAmount = balance * pct / 100, offset = riskAmount / qty
        const riskAmount = (availableBalance * slPercentage) / 100;
        const offset = riskAmount / qty;
        const slPrice = orderForm.side === "BUY" ? entryPrice - offset : entryPrice + offset;
        if (slPrice > 0) {
          setOrderForm((prev) => ({ ...prev, stopLoss: slPrice.toFixed(decimals) }));
        }
      } else {
        // Fallback: use price-based % when balance/qty not available
        const slPrice = orderForm.side === "BUY"
          ? entryPrice * (1 - slPercentage / 100)
          : entryPrice * (1 + slPercentage / 100);
        if (slPrice > 0) {
          setOrderForm((prev) => ({ ...prev, stopLoss: slPrice.toFixed(decimals) }));
        }
      }
    }

    // Initialize TP if empty and user hasn't manually edited
    if (!hasUserEditedTP && !orderForm.takeProfit) {
      if (availableBalance > 0 && qty > 0) {
        const profitAmount = (availableBalance * tpPercentage) / 100;
        const offset = profitAmount / qty;
        const tpPrice = orderForm.side === "BUY" ? entryPrice + offset : entryPrice - offset;
        if (tpPrice > 0) {
          setOrderForm((prev) => ({ ...prev, takeProfit: tpPrice.toFixed(decimals) }));
        }
      } else {
        const tpPrice = orderForm.side === "BUY"
          ? entryPrice * (1 + tpPercentage / 100)
          : entryPrice * (1 - tpPercentage / 100);
        if (tpPrice > 0) {
          setOrderForm((prev) => ({ ...prev, takeProfit: tpPrice.toFixed(decimals) }));
        }
      }
    }
  }, [
    useSlTpSlider,
    currentPrice,
    orderForm.type,
    orderForm.price,
    orderForm.side,
    orderForm.stopLoss,
    orderForm.takeProfit,
    orderForm.quantity,
    slPercentage,
    tpPercentage,
    tickSize,
    hasUserEditedSL,
    hasUserEditedTP,
    availableBalance,
  ]);

  // NOTE: fetchAccountAndPositionDetails and fetchOpenOrders removed.
  // Data is now fetched centrally via TradingDataContext and synced to local state above.

  // Periodic refresh using context (initial fetch is handled by context on symbol change)
  useEffect(() => {
    if (!selectedAccount) return;

    // Set up periodic refresh only - initial fetch already happens in context
    const interval = setInterval(() => {
      contextRefreshAll();
    }, DETAILS_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [selectedAccount, contextRefreshAll]);

  const handleInputChange = (
    field: keyof OrderForm,
    value: string | boolean
  ) => {
    if (field === "type") {
      const nextType = value as OrderForm["type"];
      setOrderForm((prev) => {
        // If switching to LIMIT, initialize price from current LTP.
        if (nextType === "LIMIT") {
          const decimals = tickSize.includes(".")
            ? tickSize.split(".")[1].replace(/0+$/, "").length
            : 2;
          return {
            ...prev,
            type: nextType,
            price:
              Number.isFinite(currentPrice) && currentPrice > 0
                ? currentPrice.toFixed(decimals)
                : prev.price,
          };
        }
        return { ...prev, type: nextType };
      });
      // Reset price-edit flag when leaving LIMIT or re-entering it.
      setHasUserEditedPrice(false);
    } else {
      setOrderForm((prev) => ({ ...prev, [field]: value }));
    }

    if (field === "stopLoss") {
      setHasUserEditedSL(true);
    }
    if (field === "takeProfit") {
      setHasUserEditedTP(true);
    }
    if (field === "price") {
      setHasUserEditedPrice(true);
    }
    if (field === "leverage" && typeof value === "string") {
      // Persist leverage changes for this symbol
      const leverageValue = parseInt(value, 10);
      if (!isNaN(leverageValue) && leverageValue > 0) {
        setStoredLeverageForSymbol(symbol, leverageValue);
      }
    }
    setError(null);
    setSuccess(null);
  };

  const handleOrderBookPriceSelect = useCallback((price: string) => {
    handleInputChange("price", price);
    setOrderBookPrice(price);
  }, []);

  const handleSliderChange = (value: number[]) => {
    // Increment change count to detect drag vs click
    // A click typically fires 1-2 times, a drag fires many more
    sliderChangeCount.current += 1;

    let percentage = value[0] / 100; // Convert from 0-10000 to 0-100
    if (isLogarithmicSlider) {
      // Map slider (0-100) to percentage (0-100) logarithmically
      // y = (x/100)^2 * 100
      percentage = Math.pow(percentage / 100, 2) * 100;
    }
    // Round to 2 decimal places (0.01%)
    percentage = Math.round(percentage * 100) / 100;

    setPositionSizePercentage(percentage);
    setQuickQuantity(percentage);
  };

  const handleSliderCommit = (value: number[]) => {
    // Check if this was a drag (many change events) or a click (1-2 change events)
    const wasDragging = sliderChangeCount.current > 2;
    sliderChangeCount.current = 0; // Reset for next interaction

    let percentage = value[0] / 100; // Convert from 0-10000 to 0-100
    if (isLogarithmicSlider) {
      percentage = 100 * Math.pow(percentage / 100, 2);
      // Snap to nearest anchor on click (not drag)
      if (!wasDragging) {
        const anchors = [0, 2, 5, 9, 20, 50, 100];
        let closest = anchors[0];
        let minDist = Math.abs(percentage - closest);
        for (const a of anchors) {
          const d = Math.abs(percentage - a);
          if (d < minDist) { closest = a; minDist = d; }
        }
        percentage = closest;
      }
      const rounded = Math.round(percentage * 100) / 100;
      setPositionSizePercentage(rounded);
      setQuickQuantity(rounded);
    } else {
      // Only snap to nearest 10% on click (not drag)
      if (wasDragging) {
        // User was dragging - keep the value as-is (rounded to 0.01%)
        const rounded = Math.round(percentage * 100) / 100;
        setPositionSizePercentage(rounded);
        setQuickQuantity(rounded);
      } else {
        // User clicked directly - snap to nearest 10%
        const snapped = Math.round(percentage / 10) * 10;
        setPositionSizePercentage(snapped);
        setQuickQuantity(snapped);
      }
    }
  };

  // Debounced SL slider handler - updates SL price based on % of available balance
  const handleSlSliderChange = useDebouncedCallback((value: number[]) => {
    // Apply logarithmic scaling if enabled: y = maxSl * (x/100)^2
    // This gives more precision at lower values (0-5% range)
    let pct = isLogarithmicSlider
      ? maxSlPercentage * Math.pow(value[0] / 100, 2)
      : value[0] * (maxSlPercentage / 100); // Linear: 0-100 maps to 0-maxSl%

    // Clamp to reasonable range (capped at liquidation)
    pct = Math.max(0.1, Math.min(maxSlPercentage, pct));
    setSlPercentage(pct);
    setHasUserEditedSL(true);

    // Calculate SL price: riskAmount = balance * pct / 100, offset = riskAmount / qty
    const entryPrice = orderForm.type === "LIMIT"
      ? parseFloat(orderForm.price) || currentPrice
      : currentPrice;
    const qty = parseFloat(orderForm.quantity) || 0;
    const decimals = tickSize.includes(".")
      ? tickSize.split(".")[1].replace(/0+$/, "").length
      : 2;

    if (availableBalance > 0 && qty > 0) {
      const riskAmount = (availableBalance * pct) / 100;
      const offset = riskAmount / qty;
      const slPrice = orderForm.side === "BUY" ? entryPrice - offset : entryPrice + offset;
      handleInputChange("stopLoss", Math.max(0, slPrice).toFixed(decimals));
    } else {
      // Fallback to price-based when balance/qty unavailable
      const slPrice = orderForm.side === "BUY"
        ? entryPrice * (1 - pct / 100)
        : entryPrice * (1 + pct / 100);
      handleInputChange("stopLoss", Math.max(0, slPrice).toFixed(decimals));
    }
  }, 50); // 50ms debounce for responsive feel

  // Debounced TP slider handler - updates TP price based on % of available balance
  const handleTpSliderChange = useDebouncedCallback((value: number[]) => {
    // Apply logarithmic scaling if enabled: y = 100 * (x/100)^2
    // This gives more precision at lower values (0-10% range)
    let pct = isLogarithmicSlider
      ? 100 * Math.pow(value[0] / 100, 2)
      : value[0]; // Linear: 0-100 maps to 0-100%

    pct = Math.max(0.1, Math.min(100, pct));
    setTpPercentage(pct);
    setHasUserEditedTP(true);

    const entryPrice = orderForm.type === "LIMIT"
      ? parseFloat(orderForm.price) || currentPrice
      : currentPrice;
    const qty = parseFloat(orderForm.quantity) || 0;
    const decimals = tickSize.includes(".")
      ? tickSize.split(".")[1].replace(/0+$/, "").length
      : 2;

    if (availableBalance > 0 && qty > 0) {
      const profitAmount = (availableBalance * pct) / 100;
      const offset = profitAmount / qty;
      const tpPrice = orderForm.side === "BUY" ? entryPrice + offset : entryPrice - offset;
      handleInputChange("takeProfit", Math.max(0, tpPrice).toFixed(decimals));
    } else {
      const tpPrice = orderForm.side === "BUY"
        ? entryPrice * (1 + pct / 100)
        : entryPrice * (1 - pct / 100);
      handleInputChange("takeProfit", Math.max(0, tpPrice).toFixed(decimals));
    }
  }, 50); // 50ms debounce for responsive feel

  // Memoized callback for OrderBookPrice applied
  const handleOrderBookPriceApplied = useCallback(() => {
    setOrderBookPrice(null);
  }, []);

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
      return liqPrice > 0
        ? liqPrice.toFixed(calculatePriceDecimals(entryPrice))
        : "N/A";
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
    const riskPercentage =
      availableBalance > 0 ? (riskAmount / availableBalance) * 100 : 0;

    return { amount: riskAmount, percentage: riskPercentage };
  }, [
    orderForm.quantity,
    orderForm.price,
    orderForm.stopLoss,
    orderForm.side,
    orderForm.type,
    currentPrice,
    availableBalance,
  ]);

  // Calculate profit amount based on take profit price
  const calculateProfitAmount = useMemo(() => {
    const qty = parseFloat(orderForm.quantity) || 0;
    const entryPrice =
      orderForm.type === "MARKET"
        ? currentPrice
        : parseFloat(orderForm.price) || currentPrice;
    const tpPrice = parseFloat(orderForm.takeProfit) || 0;

    if (qty <= 0 || entryPrice <= 0 || tpPrice <= 0) {
      return { amount: 0, percentage: 0, isValid: true };
    }

    let priceDiff: number;
    if (orderForm.side === "BUY") {
      // For BUY: TP should be above entry price
      priceDiff = tpPrice - entryPrice;
    } else {
      // For SELL: TP should be below entry price
      priceDiff = entryPrice - tpPrice;
    }

    // If priceDiff is negative, TP is on the wrong side (would be a loss)
    const isValid = priceDiff > 0;
    const profitAmount = Math.abs(priceDiff * qty);
    const profitPercentage =
      availableBalance > 0 ? (profitAmount / availableBalance) * 100 : 0;

    return { amount: profitAmount, percentage: profitPercentage, isValid };
  }, [
    orderForm.quantity,
    orderForm.price,
    orderForm.takeProfit,
    orderForm.side,
    orderForm.type,
    currentPrice,
    availableBalance,
  ]);

  const setQuickQuantity = (percentage: number) => {
    const limitPrice = parseFloat(orderForm.price);
    const referencePrice =
      orderForm.type === "LIMIT" && Number.isFinite(limitPrice) && limitPrice > 0
        ? limitPrice
        : currentPrice;

    // If we don't have a valid price yet (common on fresh page load), don't compute
    // a quantity that would become Infinity/NaN.
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) return;

    const leverage = parseFloat(orderForm.leverage) || 1;

    if (availableBalance > 0) {
      const maxPositionValue = availableBalance * leverage;
      const rawQuantity = (maxPositionValue / referencePrice) * (percentage / 100);
      const quantity = roundToStep(rawQuantity, stepSize);
      handleInputChange("quantity", quantity);
      return;
    }

    // Fallback if balance not available
    const baseAmount = 1000;
    const rawQuantity = (baseAmount * leverage / referencePrice) * (percentage / 100);
    const quantity = roundToStep(rawQuantity, stepSize);
    handleInputChange("quantity", quantity);
  };

  // Recalculate quantity whenever position size percentage changes, OR on the first render
  // with a valid price (ensures the 1% default is applied on mount).
  useEffect(() => {
    if (positionSizePercentage <= 0) return;
    // Only recalculate if the percentage has actually changed since last time we applied it
    if (lastAppliedPercentage.current === positionSizePercentage) return;

    const limitPrice = parseFloat(orderForm.price);
    const referencePrice =
      orderForm.type === "LIMIT" && Number.isFinite(limitPrice) && limitPrice > 0
        ? limitPrice
        : currentPrice;

    if (!Number.isFinite(referencePrice) || referencePrice <= 0) return;

    const leverage = parseFloat(orderForm.leverage) || 1;
    const maxPositionValue =
      availableBalance > 0 ? availableBalance * leverage : 1000 * leverage;
    const rawQuantity = (maxPositionValue / referencePrice) * (positionSizePercentage / 100);
    const nextQuantity = roundToStep(rawQuantity, stepSize);

    lastAppliedPercentage.current = positionSizePercentage;
    setOrderForm((prev) => {
      if (prev.quantity === nextQuantity) return prev;
      return { ...prev, quantity: nextQuantity };
    });
  }, [
    positionSizePercentage,
    orderForm.leverage,
    orderForm.type,
    orderForm.price,
    availableBalance,
    currentPrice,
    stepSize,
  ]);

  const submitOrder = async () => {
    // Check if demo account + not authenticated
    if (isDemoTradingBlocked) {
      setError("Please sign in to enable demo trading");
      return;
    }

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

    // Validate minimum quantity and notional value
    const quantity = parseFloat(orderForm.quantity);
    if (minQty > 0 && quantity < minQty) {
      setError(
        `Quantity ${quantity} is below minimum ${minQty} for ${symbol}. ` +
        `Please increase position size to at least ${minQty}.`
      );
      return;
    }

    // Validate notional value
    if (minNotional > 0) {
      const price =
        orderForm.type === "LIMIT"
          ? parseFloat(orderForm.price)
          : currentPrice || 0;

      const notional = quantity * price;
      if (notional < minNotional) {
        if (price <= 0) {
          setError(
            `Order notional value ${notional.toFixed(2)} is below minimum ${minNotional} for ${symbol}. ` +
            `Cannot calculate required quantity - invalid price.`
          );
          return;
        }
        const requiredQty = (minNotional / price).toFixed(
          orderForm.quantity.includes(".") ? orderForm.quantity.split(".")[1].length : 0
        );
        setError(
          `Order notional value ${notional.toFixed(2)} is below minimum ${minNotional} for ${symbol}. ` +
          `Required quantity: ${requiredQty} (at price ${price.toFixed(2)})`
        );
        return;
      }
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

      const response = await api.post("/orders/place", orderData);

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to place order");
      }

      // Check for SL/TP warnings
      let successMessage = `${orderForm.side} order placed successfully for ${orderForm.quantity} ${symbol}`;
      if (response.data.warnings && response.data.warnings.length > 0) {
        const warningMessages = response.data.warnings
          .map((w: { message: string }) => w.message)
          .join("; ");
        successMessage += ` ⚠️ Warning: ${warningMessages}`;
        // Also set as error to make it more visible
        setError(`SL/TP Warning: ${warningMessages}`);
      }

      setSuccess(successMessage);

      // Persist the leverage used for this order
      const usedLeverage = parseFloat(orderForm.leverage);
      if (!isNaN(usedLeverage) && usedLeverage > 0) {
        setStoredLeverageForSymbol(symbol, usedLeverage);
      }

      onOrderPlaced();
      setOrderRefreshTrigger((prev) => prev + 1); // Trigger refresh of positions/orders tabs
      // Refresh open orders and position data to update chart lines
      setTimeout(() => {
        contextRefreshAll();
      }, 1000);

      if (response.data.warnings && response.data.warnings.length > 0) {
        // Parse warnings to see if they are SL/TP failures
        const failedTypes: ("sl_failed" | "tp_failed")[] = [];
        response.data.warnings.forEach((w: { type: string }) => {
          if (w.type === "sl_failed") failedTypes.push("sl_failed");
          if (w.type === "tp_failed") failedTypes.push("tp_failed");
        });

        if (failedTypes.length > 0) {
          setRetryState({
            symbol,
            quantity: parseFloat(orderForm.quantity),
            originalSide: orderForm.side,
            originalType: orderForm.type,
            slPrice: orderForm.stopLoss ? parseFloat(orderForm.stopLoss) : undefined,
            tpPrice: orderForm.takeProfit ? parseFloat(orderForm.takeProfit) : undefined,
            failedTypes,
          });
        } else {
          // Reset form only if no critical SL/TP failures that need retry
          setRetryState(null);
          setOrderForm((prev) => ({
            ...prev,
            quantity: "0.001",
            price: currentPrice.toFixed(
              tickSize.includes(".")
                ? tickSize.split(".")[1].replace(/0+$/, "").length
                : 2
            ),
            stopPrice: "",
            stopLoss: "",
            takeProfit: "",
          }));
          setPositionSizePercentage(0);
        }
      } else {
        // No warnings, safe to reset
        setRetryState(null);
        setOrderForm((prev) => ({
          ...prev,
          quantity: "0.001",
          price: currentPrice.toFixed(
            tickSize.includes(".")
              ? tickSize.split(".")[1].replace(/0+$/, "").length
              : 2
          ),
          stopPrice: "",
          stopLoss: "",
          takeProfit: "",
        }));
        setPositionSizePercentage(0);
      }

    } catch (err: any) {
      console.error("Order placement error:", err);
      const errorData = err.response?.data;
      // Show the detailed error message from the server if available
      const errorMsg = errorData?.details || errorData?.error || err.message || "Failed to place order";
      setError(errorMsg);
      setSuccess(null);
      setRetryState(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetrySlTp = async () => {
    if (!retryState || !orderForm.accountId) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const inputsToRetry: any[] = [];
    const {
      symbol: rSymbol,
      quantity,
      originalSide,
      originalType,
      slPrice,
      tpPrice,
      failedTypes,
    } = retryState;

    // Logic:
    // If original was MARKET -> Close Position (closePosition=true)
    // If original was LIMIT -> Reduce Only (reduceOnly=true, quantity=qty)
    // Note: This logic assumes the MAIN order was filled.
    const isMarket = originalType === "MARKET";

    try {
      if (failedTypes.includes("sl_failed") && slPrice) {
        // SL is opposite side of entry
        const slSide = originalSide === "BUY" ? "SELL" : "BUY";
        inputsToRetry.push({
          accountId: orderForm.accountId,
          symbol: rSymbol,
          side: slSide,
          type: "STOP_MARKET",
          stopPrice: slPrice,
          quantity: isMarket ? undefined : quantity,
          reduceOnly: isMarket ? undefined : true, // For Limit, reduceOnly
          closePosition: isMarket ? true : undefined, // For Market, closePosition
        });
      }

      if (failedTypes.includes("tp_failed") && tpPrice) {
        // TP is opposite side of entry
        const tpSide = originalSide === "BUY" ? "SELL" : "BUY";
        inputsToRetry.push({
          accountId: orderForm.accountId,
          symbol: rSymbol,
          side: tpSide,
          type: "TAKE_PROFIT_MARKET",
          stopPrice: tpPrice,
          quantity: isMarket ? undefined : quantity,
          reduceOnly: isMarket ? undefined : true,
          closePosition: isMarket ? true : undefined,
        });
      }

      const results = await Promise.allSettled(
        inputsToRetry.map((input) => api.post("/orders/place", input))
      );

      const failures: string[] = [];
      const successes: string[] = [];

      results.forEach((res, idx) => {
        const typeLabel = inputsToRetry[idx].type === "STOP_MARKET" ? "SL" : "TP";
        if (res.status === "fulfilled" && res.value.data.success) {
          successes.push(typeLabel);
        } else {
          const msg =
            res.status === "rejected"
              ? res.reason.message
              : res.value.data.error || "Unknown error";
          failures.push(`${typeLabel}: ${msg}`);
        }
      });

      if (failures.length === 0) {
        setSuccess(`Successfully retried: ${successes.join(", ")}`);
        setRetryState(null); // Clear retry state on full success
        // Reset form now that everything is done
        setOrderForm((prev) => ({
          ...prev,
          quantity: "0.001",
          price: currentPrice.toFixed(
            tickSize.includes(".")
              ? tickSize.split(".")[1].replace(/0+$/, "").length
              : 2
          ),
          stopPrice: "",
          stopLoss: "",
          takeProfit: "",
        }));
        setPositionSizePercentage(0);

      } else {
        if (successes.length > 0) {
          // Partial success
          setSuccess(`Retried ${successes.join(", ")} successfully.`);
          // Remove successful ones from failedTypes so user can retry again
          const newFailedTypes = failedTypes.filter(t => {
            if (t === "sl_failed" && !failures.some(f => f.startsWith("SL"))) return false;
            if (t === "tp_failed" && !failures.some(f => f.startsWith("TP"))) return false;
            return true;
          });
          setRetryState(prev => prev ? ({ ...prev, failedTypes: newFailedTypes }) : null);
        }
        setError(`Retry failed for: ${failures.join("; ")}`);
      }
    } catch (err: any) {
      console.error("Retry error", err);
      setError("System error during retry.");
    } finally {
      setIsSubmitting(false);
    }
  };


  // Build price lines for the chart
  const chartPriceLines = useMemo(() => {
    const lines = [];

    // Stop Loss line
    if (orderForm.stopLoss) {
      const slPrice = parseFloat(String(orderForm.stopLoss).replace(/,/g, ""));
      if (slPrice > 0) {
        lines.push({
          price: slPrice,
          color: "#ec4899", // Pink/Magenta for better distinction
          lineWidth: 1,
          lineStyle: 2, // Dashed
        });
      }
    }

    // Take Profit line
    if (orderForm.takeProfit) {
      const tpPrice = parseFloat(String(orderForm.takeProfit).replace(/,/g, ""));
      if (tpPrice > 0) {
        lines.push({
          price: tpPrice,
          color: "#3b82f6", // Blue
          lineWidth: 1,
          lineStyle: 2, // Dashed
        });
      }
    }

    // Existing position entry price line
    if (existingPosition && existingPosition.entryPrice > 0) {
      lines.push({
        price: existingPosition.entryPrice,
        color: "#f59e0b", // Amber/Orange for position
        lineWidth: 2,
        lineStyle: 0, // Solid
      });
    }

    // Open orders price lines
    openOrders.forEach((order) => {
      const isSL = order.orderType.includes("STOP") && !order.orderType.includes("TAKE_PROFIT");
      const isTP = order.orderType.includes("TAKE_PROFIT");
      const isConditionalOrder = isSL || isTP;

      if (isConditionalOrder) {
        // SL/TP conditional orders — use stopPrice
        const orderPrice = order.stopPrice && order.stopPrice > 0 ? order.stopPrice : order.price;
        if (orderPrice > 0) {
          let color = "#ec4899"; // SL color
          if (isTP) color = "#3b82f6"; // TP color

          lines.push({
            price: orderPrice,
            color: color,
            lineWidth: 1,
            lineStyle: 1, // Dotted for conditional orders
            title: isSL ? "SL" : "TP",
          });
        }
      } else if (order.orderType === "LIMIT" && order.price > 0) {
        // Regular LIMIT orders — show buy/sell lines
        const isBuy = order.transactionType === "BUY";
        lines.push({
          price: order.price,
          color: isBuy ? "#86efac" : "#fca5a5", // Green for buy, red for sell
          lineWidth: 1,
          lineStyle: 2, // Dashed for limit orders
          title: isBuy ? "Buy" : "Sell",
        });
      }
    });

    return lines;
  }, [
    orderForm.stopLoss,
    orderForm.takeProfit,
    existingPosition,
    openOrders
  ]);

  const chartLegend = useMemo(() => [
    { label: "Stop Loss", color: "#ec4899" },
    { label: "Take Profit", color: "#3b82f6" },
    ...(existingPosition ? [{ label: "Position Entry", color: "#f59e0b" }] : []),
    ...(openOrders.length > 0 ? [
      { label: "Open Buy Order", color: "#86efac" },
      { label: "Open Sell Order", color: "#fca5a5" },
    ] : []),
  ], [existingPosition, openOrders]);

  return {
    accountDetails,
    applyConfig,
    availableBalance,
    calculateLiquidationPrice,
    calculateOrderValue,
    calculateProfitAmount,
    calculateRiskedAmount,
    chartLegend,
    chartPriceLines,
    contextRefreshAll,
    defaultRiskAmount,
    draftDefaultRiskPercent,
    draftDefaultTakeProfitPercent,
    draftUserMaxLeverage,
    error,
    existingPosition,
    handleDefaultRiskChange,
    handleDefaultTakeProfitChange,
    handleInputChange,
    handleOrderBookPriceApplied,
    handleOrderBookPriceSelect,
    handleRetrySlTp,
    handleSlSliderChange,
    handleSliderChange,
    handleSliderCommit,
    handleTpSliderChange,
    handleUserMaxLeverageChange,
    isConfigDirty,
    isDemoTradingBlocked,
    isLogarithmicSlider,
    isRefreshingDetails,
    isSubmitting,
    lastDetailsRefresh,
    maxLeverage,
    maxSlPercentage,
    minNotional,
    minQty,
    orderBookPrice,
    orderForm,
    orderRefreshTrigger,
    positionSizePercentage,
    retryState,
    setIsLogarithmicSlider,
    setPositionSizePercentage,
    setQuickQuantity,
    setTpPercentage,
    setUseSlTpSlider,
    slAutoCalcWarning,
    slPercentage,
    stepSize,
    submitOrder,
    success,
    syncPriceToCurrent,
    tickSize,
    tpPercentage,
    useSlTpSlider,
  };
}

const TradingWindow = memo(function TradingWindow(props: TradingWindowProps) {
  const {
    symbol,
    currentPrice,
    accounts,
    selectedAccount,
    marketType = "futures",
    onSymbolSelect,
  } = props;
  const {
    accountDetails,
    applyConfig,
    availableBalance,
    calculateLiquidationPrice,
    calculateOrderValue,
    calculateProfitAmount,
    calculateRiskedAmount,
    chartLegend,
    chartPriceLines,
    contextRefreshAll,
    defaultRiskAmount,
    draftDefaultRiskPercent,
    draftDefaultTakeProfitPercent,
    draftUserMaxLeverage,
    error,
    existingPosition,
    handleDefaultRiskChange,
    handleDefaultTakeProfitChange,
    handleInputChange,
    handleOrderBookPriceApplied,
    handleOrderBookPriceSelect,
    handleRetrySlTp,
    handleSlSliderChange,
    handleSliderChange,
    handleSliderCommit,
    handleTpSliderChange,
    handleUserMaxLeverageChange,
    isConfigDirty,
    isDemoTradingBlocked,
    isLogarithmicSlider,
    isRefreshingDetails,
    isSubmitting,
    lastDetailsRefresh,
    maxLeverage,
    maxSlPercentage,
    minNotional,
    minQty,
    orderBookPrice,
    orderForm,
    orderRefreshTrigger,
    positionSizePercentage,
    retryState,
    setIsLogarithmicSlider,
    setPositionSizePercentage,
    setQuickQuantity,
    setTpPercentage,
    setUseSlTpSlider,
    slAutoCalcWarning,
    slPercentage,
    stepSize,
    submitOrder,
    success,
    syncPriceToCurrent,
    tickSize,
    tpPercentage,
    useSlTpSlider,
  } = useTradingWindow(props);

  if (accounts.length === 0) {
    return (
      <div className="trading-window-empty">
        <p>No trading accounts available</p>
      </div>
    );
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
        legend={chartLegend}
        currentPrice={currentPrice}
      />
      <div className="trading-header flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
        {/* Row 1: Symbol and Price */}
        <div className="flex items-center justify-between md:gap-4">
          <h3 className="text-base font-semibold md:text-lg">{symbol} Trading</h3>
          <div className="text-lg font-bold text-primary md:order-last">${currentPrice.toFixed(2)}</div>
        </div>

        {/* Row 2: Buy/Sell Buttons and Refresh Controls */}
        <div className="flex items-center justify-between gap-2 md:gap-4">
          {/* Buy/Sell Buttons - Left on mobile */}
          <div className="flex items-center gap-1">
            <Button
              variant={orderForm.side === "BUY" ? "success" : "outline"}
              size="sm"
              className={orderForm.side === "BUY" ? "bg-green-600 hover:bg-green-700 text-white h-7" : "h-7"}
              onClick={() => handleInputChange("side", "BUY")}
            >
              Buy
            </Button>
            <Button
              variant={orderForm.side === "SELL" ? "danger" : "outline"}
              size="sm"
              className={orderForm.side === "SELL" ? "bg-red-600 hover:bg-red-700 text-white h-7" : "h-7"}
              onClick={() => handleInputChange("side", "SELL")}
            >
              Sell
            </Button>
          </div>

          {/* Refresh Controls - Right on mobile */}
          <div className="flex items-center gap-2">
            {lastDetailsRefresh && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                Updated {new Date(lastDetailsRefresh).toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                contextRefreshAll();
                syncPriceToCurrent();
              }}
              disabled={!selectedAccount || isRefreshingDetails}
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${isRefreshingDetails ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="trading-content">
        <TooltipProvider>
          <div className="trading-form">
            {/* Existing Position Warning */}
            {existingPosition && (
              <div className="existing-position-warning">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">
                    Existing {existingPosition.size > 0 ? "LONG" : "SHORT"} position
                  </span>
                  <span className="text-xs opacity-90 ml-2">
                    {Math.abs(existingPosition.size)} @ {formatPrice(existingPosition.entryPrice, "$")}
                    <span className={existingPosition.pnl >= 0 ? "text-green-300 ml-2" : "text-red-300 ml-2"}>
                      ({existingPosition.pnl >= 0 ? "+" : ""}{formatPrice(Math.abs(existingPosition.pnl))})
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Position Sizing Slider */}
            <div className="form-group mb-4">
              <div className="flex justify-between items-center mb-1">
                <label className="mb-0">
                  Position Size:{" "}
                  <span className="slider-value-display">
                    {positionSizePercentage.toFixed(2)}%
                  </span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="expSlider"
                    checked={isLogarithmicSlider}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsLogarithmicSlider(checked);
                      try {
                        localStorage.setItem(
                          LOGARITHMIC_SLIDER_STORAGE_KEY,
                          String(checked)
                        );
                      } catch {
                        // ignore
                      }
                    }}
                    className="form-checkbox w-3 h-3"
                  />
                  <label
                    htmlFor="expSlider"
                    className="text-[10px] cursor-pointer text-muted-foreground mb-0"
                  >
                    Log. Spacing
                  </label>
                </div>
              </div>
              <div className="slider-wrapper">
                <Slider
                  value={[
                    isLogarithmicSlider
                      ? Math.sqrt(positionSizePercentage / 100) * 100 * 100
                      : positionSizePercentage * 100,
                  ]}
                  onValueChange={handleSliderChange}
                  onValueCommit={handleSliderCommit}
                  max={10000}
                  step={1}
                  className="position-slider"
                />
              </div>
              <div className="slider-labels">
                {isLogarithmicSlider ? (
                  <>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(0); setQuickQuantity(0); }}>0%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(2); setQuickQuantity(2); }}>2%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(5); setQuickQuantity(5); }}>5%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(9); setQuickQuantity(9); }}>9%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(20); setQuickQuantity(20); }}>20%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(50); setQuickQuantity(50); }}>50%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => { setPositionSizePercentage(100); setQuickQuantity(100); }}>100%</span>
                  </>
                ) : (
                  <>
                    <span className="cursor-pointer hover:text-primary" onClick={() => handleSliderCommit([0])}>0%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => handleSliderCommit([2000])}>20%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => handleSliderCommit([4000])}>40%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => handleSliderCommit([6000])}>60%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => handleSliderCommit([8000])}>80%</span>
                    <span className="cursor-pointer hover:text-primary" onClick={() => handleSliderCommit([10000])}>100%</span>
                  </>
                )}
              </div>
            </div>

            {/* Unified 3-Column Layout: Order Fields | SL-TP-Summary | Config-Account */}
            <div className="unified-form-layout">
              <div className="unified-form-main">
            {/* Two Column Grid */}
            <div className="form-grid">


              {/* Quantity */}
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  value={orderForm.quantity}
                  onChange={(e) =>
                    handleInputChange("quantity", e.target.value)
                  }
                  className="form-input"
                  placeholder="0.001"
                  step={stepSize}
                />
                {(minQty > 0 || minNotional > 0) && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {minQty > 0 && (
                      <div>Min qty: {minQty}</div>
                    )}
                    {minNotional > 0 && (
                      <div>
                        Min notional: ${minNotional} (at {currentPrice?.toFixed(2) || "current"} price)
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Price (for limit orders) */}
              {orderForm.type === "LIMIT" && (
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
              )}

              {/* Stop Loss with Risk Amount */}
              <div className="form-group">
                <label>Stop Loss *</label>
                {useSlTpSlider ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <Slider
                        value={[isLogarithmicSlider
                          ? Math.sqrt(slPercentage / maxSlPercentage) * 100  // Reverse logarithmic for display
                          : (slPercentage / maxSlPercentage) * 100]} // Linear: 0-maxSl% maps to 0-100
                        min={0}
                        max={100}
                        step={0.5}
                        onValueChange={handleSlSliderChange}
                        className="flex-1"
                      />
                      <span className="text-xs font-medium w-14 text-right text-orange-500">
                        {slPercentage.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>SL: {orderForm.stopLoss || "—"}</span>
                      {calculateRiskedAmount.amount > 0 && (
                        <span className={calculateRiskedAmount.percentage > 5 ? "text-red-500" : "text-orange-500"}>
                          Risk: ${calculateRiskedAmount.amount.toFixed(2)} ({calculateRiskedAmount.percentage.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <input
                    type="number"
                    value={orderForm.stopLoss}
                    onChange={(e) =>
                      handleInputChange("stopLoss", e.target.value)
                    }
                    className="form-input"
                    placeholder="SL Price"
                    step={tickSize}
                    required
                  />
                )}
                {!useSlTpSlider && calculateRiskedAmount.amount > 0 && (
                  <div
                    className={`risk-amount ${calculateRiskedAmount.percentage > 5
                      ? "risk-high"
                      : "risk-normal"
                      }`}
                  >
                    Risk: ${calculateRiskedAmount.amount.toFixed(2)} (
                    {calculateRiskedAmount.percentage.toFixed(1)}%)
                  </div>
                )}
                {slAutoCalcWarning && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{slAutoCalcWarning}</span>
                  </div>
                )}
              </div>

              {/* Take Profit */}
              <div className="form-group">
                <label>Take Profit</label>
                {useSlTpSlider ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <Slider
                        value={[isLogarithmicSlider
                          ? Math.sqrt(tpPercentage / 100) * 100  // Reverse logarithmic for display
                          : tpPercentage]} // Linear: 0-100% maps to 0-100
                        min={0}
                        max={100}
                        step={0.5}
                        onValueChange={handleTpSliderChange}
                        className="flex-1"
                      />
                      <span className="text-xs font-medium w-14 text-right text-blue-500">
                        {tpPercentage.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>TP: {orderForm.takeProfit || "—"}</span>
                        {orderForm.takeProfit && (
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-foreground"
                            onClick={() => {
                              handleInputChange("takeProfit", "");
                              setTpPercentage(0);
                            }}
                          />
                        )}
                      </div>
                      {calculateProfitAmount.amount > 0 && (
                        <span className={calculateProfitAmount.isValid ? "text-green-500" : "text-red-500"}>
                          {calculateProfitAmount.isValid
                            ? `Profit: $${calculateProfitAmount.amount.toFixed(2)} (${calculateProfitAmount.percentage.toFixed(1)}%)`
                            : `Invalid TP`}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <input
                    type="number"
                    value={orderForm.takeProfit}
                    onChange={(e) =>
                      handleInputChange("takeProfit", e.target.value)
                    }
                    className="form-input"
                    placeholder="TP Price"
                    step={tickSize}
                  />
                )}
                {!useSlTpSlider && calculateProfitAmount.amount > 0 && (
                  <div
                    className={
                      calculateProfitAmount.isValid
                        ? "profit-amount"
                        : "profit-amount-invalid"
                    }
                  >
                    {calculateProfitAmount.isValid
                      ? `Profit: $${calculateProfitAmount.amount.toFixed(
                        2
                      )} (${calculateProfitAmount.percentage.toFixed(1)}%)`
                      : `Invalid: TP is on wrong side (would lose $${calculateProfitAmount.amount.toFixed(
                        2
                      )})`}
                  </div>
                )}
              </div>

              {/* Order Type */}
              <div className="form-group">
                <label>Type</label>
                <select
                  value={orderForm.type}
                  onChange={(e) =>
                    handleInputChange("type", e.target.value as any)
                  }
                  className="form-select"
                >
                  <option value="MARKET">Market</option>
                  <option value="LIMIT">Limit</option>
                  <option value="STOP_MARKET">Stop Market</option>
                  <option value="TAKE_PROFIT_MARKET">Take Profit Mkt</option>
                </select>
              </div>

              {/* Reduce Only */}
              <div className="form-group flex flex-row items-center gap-2">
                <label className="mb-0 text-xs font-semibold whitespace-nowrap">
                  Reduce Only
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[200px] text-xs">
                      When enabled, this order will only reduce your existing
                      position, not increase it. Useful for closing positions
                      without accidentally opening a new one.
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
                  <label
                    htmlFor="reduceOnly"
                    className="mb-0 text-xs cursor-pointer"
                  >
                    Yes
                  </label>
                </div>
              </div>
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
            {error && (
              <div className="error-message flex flex-col gap-2">
                <span>{error}</span>
                {retryState && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full h-8 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/50"
                    onClick={handleRetrySlTp}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Retrying..." : "Retry SL/TP Orders"}
                  </Button>
                )}
              </div>
            )}
            {success && <div className="success-message">{success}</div>}

            {/* Submit Button */}
            <Button
              variant={orderForm.side === "BUY" ? "success" : "danger"}
              size="sm"
              disabled={isSubmitting || isDemoTradingBlocked}
              onClick={submitOrder}
              className="w-full"
            >
              {isSubmitting
                ? "Placing Order..."
                : isDemoTradingBlocked
                ? "Sign in to Trade"
                : `${orderForm.side} ${symbol}`}
            </Button>

            {/* Demo trading info message */}
            {isDemoTradingBlocked && (
              <div className="mt-2 p-2 text-xs text-center text-muted-foreground bg-muted/50 rounded">
                Sign in to enable demo trading with testnet funds
              </div>
            )}
              </div>

              {/* Column 3: Config & Account Info */}
              <div className="unified-form-sidebar">
                <div className="bg-card p-3 rounded-md text-xs space-y-1.5 border shadow-sm">
                  <div className="font-medium text-muted-foreground mb-2 text-[1rem]">
                    Config
                  </div>
                  <div className="space-y-3">
                    {/* Leverage Slider */}
                    <div className="form-group mb-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-muted-foreground mb-0">
                          Leverage
                        </label>
                        <span className="text-[10px] font-medium text-primary">
                          {orderForm.leverage}x
                        </span>
                      </div>
                      <Slider
                        value={[parseInt(orderForm.leverage) || 1]}
                        min={1}
                        max={maxLeverage}
                        step={1}
                        onValueChange={(value) =>
                          handleInputChange("leverage", String(value[0]))
                        }
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                        <span>1x</span>
                        <span>{maxLeverage}x</span>
                      </div>
                    </div>

                    <div className="form-group mb-0">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] text-muted-foreground">
                          Max Lev. Global
                        </span>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              <p className="text-xs">
                                <strong>Maximum Leverage</strong>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                The maximum leverage multiplier to use for your
                                trades. Higher leverage = higher risk.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <input
                        type="number"
                        value={draftUserMaxLeverage}
                        onChange={(e) =>
                          handleUserMaxLeverageChange(parseInt(e.target.value) || 1)
                        }
                        className="form-input w-full text-left px-2 py-1 h-7 text-xs"
                        min="1"
                        max="125"
                        step="1"
                      />
                    </div>
                    <div className="form-group mb-0">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] text-muted-foreground">
                          Def. Risk (%)
                        </span>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              <p className="text-xs">
                                <strong>Default Risk Percentage</strong>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                The percentage of your account balance you're
                                willing to risk per trade. Used to auto-calculate
                                stop loss price.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={draftDefaultRiskPercent}
                          onChange={(e) => handleDefaultRiskChange(e.target.value)}
                          className="form-input w-full text-left px-2 py-1 h-7 text-xs"
                          placeholder="1"
                          min="0.1"
                          max="100"
                          step="0.1"
                        />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {defaultRiskAmount !== null
                            ? `≈ $${defaultRiskAmount.toFixed(2)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div className="form-group mb-0">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] text-muted-foreground">
                          Def. TP (%)
                        </span>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              <p className="text-xs">
                                <strong>Default Take Profit %</strong>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Optional: Percentage of your available balance you
                                want to target as profit per trade. Auto-calculates
                                TP price from entry and position size. Leave empty
                                to disable.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={draftDefaultTakeProfitPercent}
                          onChange={(e) =>
                            handleDefaultTakeProfitChange(e.target.value)
                          }
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

                    {/* SL/TP Slider Toggle */}
                    <div className="form-group mb-0 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">
                            Use SL/TP Sliders
                          </span>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">
                                  <strong>SL/TP Slider Mode</strong>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  When enabled, use sliders to set Stop Loss and
                                  Take Profit as percentages from entry price.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <input
                          type="checkbox"
                          checked={useSlTpSlider}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUseSlTpSlider(checked);
                            try {
                              localStorage.setItem(
                                USE_SL_TP_SLIDER_STORAGE_KEY,
                                String(checked)
                              );
                            } catch {
                              // ignore
                            }
                          }}
                          className="form-checkbox w-3.5 h-3.5"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 h-7 text-xs"
                    disabled={!isConfigDirty}
                    onClick={() => {
                      applyConfig();
                      const toast = document.createElement("div");
                      toast.className =
                        "fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md text-sm z-50 animate-fade-in";
                      toast.textContent = "Config saved!";
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
            </div>
          </div>
        </TooltipProvider>

        {/* Order Book - Right Column */}
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
          onOrderBookPriceApplied={handleOrderBookPriceApplied}
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
          min-width: 0;
          padding: 16px;
          background: #ffffff;
        }

        .dark .trading-form {
          background: #09090b !important;
        }

        .unified-form-layout {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .unified-form-main {
          flex: 1;
          min-width: 0;
        }

        .unified-form-sidebar {
          flex: 0 0 220px;
          max-width: 220px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .existing-position-warning {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          margin-bottom: 12px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          border-radius: 6px;
          font-size: 0.875rem;
          box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);
          animation: pulse-warning 2s ease-in-out infinite;
        }

        @keyframes pulse-warning {
          0%, 100% {
            box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);
          }
          50% {
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.5);
          }
        }

        .dark .existing-position-warning {
          background: linear-gradient(135deg, #b45309 0%, #92400e 100%);
        }

        /* trading-info-panel styles removed - merged into unified-form-sidebar */

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

        .profit-amount {
          font-size: 0.75rem;
          margin-top: 2px;
          padding: 2px 4px;
          border-radius: 2px;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
        }

        .profit-amount-invalid {
          font-size: 0.75rem;
          margin-top: 2px;
          padding: 2px 4px;
          border-radius: 2px;
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
            flex-direction: row;
            align-items: flex-start;
          }

          .trading-form {
            flex: 3;
            min-width: 0;
            max-width: none;
            padding: 8px;
          }

          .unified-form-layout {
            flex-direction: column;
          }

          .unified-form-sidebar {
            flex: none;
            max-width: none;
            width: 100%;
          }

          .market-depth-panel {
            flex: 2;
            min-width: 0;
            max-width: none;
            border-left: 1px solid #e9ecef;
            padding: 0;
          }

          .dark .market-depth-panel {
            border-left: 1px solid #27272a;
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
