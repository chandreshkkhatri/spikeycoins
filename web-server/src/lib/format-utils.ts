import { IAccount } from "../models/account";

/**
 * Safe conversion helper to convert unknown inputs to finite numbers.
 */
export const toNumber = (value: unknown, fallback: number = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return fallback;
};

/**
 * Formats a raw Binance futures position into the unified schema.
 */
export const formatBinanceFuturesPosition = (position: any, account: IAccount) => {
  const quantity = toNumber(position.positionAmt, 0);
  const averagePrice = toNumber(position.entryPrice, 0);
  const lastPrice = toNumber(position.markPrice, averagePrice);
  const pnl = toNumber(position.unRealizedProfit, 0);
  const notional = Math.abs(quantity * averagePrice);
  const pnlPercentage = notional > 0 ? (pnl / notional) * 100 : 0;
  const symbol =
    position.symbol ||
    position.pair ||
    position.displaySymbol ||
    "UNKNOWN_SYMBOL";

  const liquidationPrice = toNumber(position.liquidationPrice, 0);
  const initialMargin = toNumber(position.initialMargin, 0);
  const leverage = toNumber(position.leverage, 1);

  const TAKER_FEE = 0.0004; // 0.04%
  const breakEvenPrice =
    quantity > 0
      ? averagePrice * (1 + TAKER_FEE * 2)
      : averagePrice * (1 - TAKER_FEE * 2);

  return {
    ...position,
    id: `${account._id}-${symbol}-${position.positionSide || "BOTH"}`,
    symbol,
    exchange: "BINANCE",
    quantity,
    averagePrice,
    lastPrice,
    pnl,
    pnlPercentage,
    leverage,
    liquidationPrice,
    breakEvenPrice: Number.isFinite(breakEvenPrice) ? breakEvenPrice : averagePrice,
    margin: initialMargin,
    marginType: position.marginType,
    product: `Futures (${(position.marginType || "cross").toUpperCase()})`,
    vendor: account.accountType,
    accountId: account._id,
    accountName: account.accountName,
    timestamp: new Date(position.updateTime || Date.now()).toISOString(),
    details: position,
  };
};

/**
 * Formats standard positions (Kite/Upstox) into the unified schema.
 */
export const formatDefaultPosition = (position: any, account: IAccount) => {
  const symbol =
    position.symbol ||
    position.tradingsymbol ||
    position.tradingSymbol ||
    position.instrument_token ||
    position.instrumentToken ||
    "UNKNOWN_SYMBOL";

  const quantity =
    position.quantity ??
    position.netQty ??
    position.net_qty ??
    position.netQuantity ??
    position.net_quantity ??
    0;

  const averagePrice =
    position.averagePrice ??
    position.average_price ??
    position.avgPrice ??
    position.avg_price ??
    0;

  const lastPrice =
    position.lastPrice ??
    position.last_price ??
    position.ltp ??
    position.lastTradedPrice ??
    position.last_traded_price ??
    0;

  const pnl =
    position.pnl ??
    position.mtm ??
    position.realizedPnl ??
    position.unrealized ??
    0;

  const pnlPercentage =
    position.pnlPercentage ??
    position.pnl_percentage ??
    (lastPrice && averagePrice
      ? ((lastPrice - averagePrice) / (averagePrice || 1)) * 100
      : 0);

  return {
    id: position.id || `${account._id}-${symbol}`,
    symbol,
    exchange: position.exchange || account.accountType.toUpperCase(),
    quantity,
    averagePrice,
    lastPrice,
    pnl,
    pnlPercentage,
    product:
      position.product ||
      position.productType ||
      position.product_type ||
      "POSITIONS",
    vendor: account.accountType,
    accountId: account._id,
    accountName: account.accountName,
    timestamp:
      position.timestamp ||
      position.lastTradeTime ||
      position.last_trade_time ||
      new Date().toISOString(),
    details: position,
  };
};

/**
 * Unified position formatting selector.
 */
export const formatPosition = (
  account: IAccount,
  position: any,
  options?: { tradingSegment?: string }
) => {
  if (account.accountType === "binance" && options?.tradingSegment === "usdm") {
    return formatBinanceFuturesPosition(position, account);
  }

  return {
    ...position,
    ...formatDefaultPosition(position, account),
  };
};

/**
 * Formats a holding into the unified schema.
 */
export const formatHolding = (holding: any, account: IAccount) => {
  if (account.accountType === "binance") {
    const free = toNumber(holding.free, 0);
    const locked = toNumber(holding.locked, 0);
    const quantity = free + locked;

    return {
      id: `${account._id}-${holding.asset}`,
      symbol: holding.asset,
      exchange: "SPOT",
      quantity: quantity,
      averagePrice: 0,
      lastPrice: 0,
      currentValue: 0,
      pnl: 0,
      pnlPercentage: 0,
      vendor: account.accountType,
      accountId: account._id,
      accountName: account.accountName,
      timestamp: new Date().toISOString(),
      details: {
        free: free,
        locked: locked,
        asset: holding.asset,
      },
    };
  }

  return {
    ...holding,
    accountId: account._id,
    accountName: account.accountName,
    vendor: account.accountType,
  };
};

/**
 * Formats funds data into the unified schema.
 */
export const formatFunds = (funds: any, account: IAccount, cryptocurrencies: any[] = []) => {
  const unifiedFunds: Record<string, any> = { details: funds };
  
  if (funds.segment === "spot") {
    let calcTotalBalance = 0;
    let calcAvailableBalance = 0;
    
    for (const b of funds.balances || []) {
      const free = toNumber(b.free, 0);
      const locked = toNumber(b.locked, 0);
      const total = free + locked;
      
      if (b.asset === "USDT" || b.asset === "USDC" || b.asset === "BUSD") {
        calcTotalBalance += total;
        calcAvailableBalance += free;
      } else {
        const crypto = cryptocurrencies.find(c => c.symbol === b.asset);
        if (crypto) {
          calcTotalBalance += total * crypto.price;
          calcAvailableBalance += free * crypto.price;
        }
      }
    }

    unifiedFunds.totalBalance = calcTotalBalance.toFixed(2);
    unifiedFunds.availableBalance = calcAvailableBalance.toFixed(2);
    unifiedFunds.usedMargin = undefined;
    unifiedFunds.unrealizedPnl = "0.00";
  } else {
    unifiedFunds.totalBalance =
      funds.equity?.available_margin || funds.totalMarginBalance || "0";
    unifiedFunds.availableBalance =
      funds.equity?.available_margin || funds.availableBalance || "0";
    unifiedFunds.usedMargin =
      funds.equity?.used_margin || funds.totalInitialMargin || undefined;
    unifiedFunds.unrealizedPnl =
      funds.equity?.unrealised_pnl ||
      funds.totalUnrealizedProfit ||
      undefined;
  }

  return unifiedFunds;
};
