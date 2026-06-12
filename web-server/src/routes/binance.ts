import { Router, Request, Response } from "express";
import { BinanceService } from "../lib/binance-service";
import binancePriceService from "../lib/binance-price-service";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { BrokerFactory } from "../lib/broker-factory";
import { demoAccountService } from "../lib/demo-account-service";
import { asyncHandler } from "../lib/async-handler";

const router: Router = Router();
const AGGREGATED_HISTORY_SYMBOL_LIMIT = 20;

const normalizeSymbol = (symbol?: string) =>
  typeof symbol === "string" ? symbol.trim().toUpperCase() : undefined;

/**
 * Derive symbols for history queries.
 */
const deriveHistorySymbols = async (
  service: BinanceService,
  preferredSymbol?: string,
  startTime?: number,
  endTime?: number,
) => {
  if (preferredSymbol) {
    return [preferredSymbol];
  }

  try {
    const income = await service.getFuturesIncomeHistory(
      "REALIZED_PNL",
      1000,
      startTime,
      endTime,
    );
    if (Array.isArray(income) && income.length > 0) {
      const incomeSymbols = Array.from(
        new Set(income.map((i: any) => i.symbol).filter((s: any) => !!s)),
      );
      if (incomeSymbols.length > 0) {
        return incomeSymbols.slice(
          0,
          AGGREGATED_HISTORY_SYMBOL_LIMIT,
        ) as string[];
      }
    }
  } catch (err) {
    console.warn("Failed to derive history symbols from income:", err);
  }

  try {
    const positions = await service.getFuturesPositions();
    if (Array.isArray(positions)) {
      const positionSymbols = Array.from(
        new Set(
          positions
            .filter((p: any) => parseFloat(p.positionAmt) !== 0)
            .map((p: any) => p.symbol),
        ),
      );
      if (positionSymbols.length > 0) {
        return positionSymbols.slice(0, AGGREGATED_HISTORY_SYMBOL_LIMIT);
      }
    }
  } catch (err) {
    console.warn("Failed to derive history symbols from positions:", err);
  }

  try {
    const openOrders = await service.getFuturesOpenOrders();
    if (Array.isArray(openOrders)) {
      const orderSymbols = Array.from(
        new Set(openOrders.map((o: any) => o.symbol)),
      );
      if (orderSymbols.length > 0) {
        return orderSymbols.slice(0, AGGREGATED_HISTORY_SYMBOL_LIMIT);
      }
    }
  } catch (err) {
    console.warn("Failed to derive history symbols from open orders:", err);
  }

  return [];
};

// GET /api/binance/price - Get current price for a symbol (Public)
router.get(
  "/price",
  asyncHandler(async (req: Request, res: Response) => {
    const { symbol, segment } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const upperSymbol = (symbol as string).toUpperCase();
    const tradingSegment = (segment as string) || "usdm";

    const cachedPrice = binancePriceService.getPrice(upperSymbol);

    if (!cachedPrice) {
      return res.status(404).json({
        error: "Price not found in cache",
        symbol: upperSymbol,
        hint: "Symbol may not exist or price service is still initializing. Try /api/prices endpoint instead.",
      });
    }

    const price = {
      symbol: cachedPrice.symbol,
      price: cachedPrice.lastPrice.toString(),
    };

    return res.json({
      success: true,
      price,
      segment: tradingSegment,
      source: "websocket_cache",
    });
  })
);

// GET /api/binance/ticker - Get 24hr ticker statistics (Public)
router.get(
  "/ticker",
  asyncHandler(async (req: Request, res: Response) => {
    const { symbol, segment } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const upperSymbol = (symbol as string).toUpperCase();
    const tradingSegment = (segment as string) || "usdm";

    const cachedPrice = binancePriceService.getPrice(upperSymbol);

    if (!cachedPrice) {
      return res.status(404).json({
        error: "Ticker not found in cache",
        symbol: upperSymbol,
        hint: "Symbol may not exist or price service is still initializing.",
      });
    }

    const ticker = {
      symbol: cachedPrice.symbol,
      priceChange: cachedPrice.priceChange.toString(),
      priceChangePercent: cachedPrice.priceChangePercent.toString(),
      lastPrice: cachedPrice.lastPrice.toString(),
      highPrice: cachedPrice.high.toString(),
      lowPrice: cachedPrice.low.toString(),
      volume: cachedPrice.volume.toString(),
      quoteVolume: cachedPrice.quoteVolume.toString(),
    };

    return res.json({
      success: true,
      ticker,
      segment: tradingSegment,
      source: "websocket_cache",
    });
  })
);

// GET /api/binance/exchange-info - Get all symbols and their rules (Public)
router.get(
  "/exchange-info",
  asyncHandler(async (req: Request, res: Response) => {
    const { segment } = req.query;
    const tradingSegment = (segment as string) || "usdm";

    const binanceService = new BinanceService();
    const info = await binanceService.getFuturesExchangeInfo();

    return res.json({
      success: true,
      data: info,
      segment: tradingSegment,
    });
  })
);

// GET /api/binance/test - Test connectivity (Public)
router.get(
  "/test",
  asyncHandler(async (req: Request, res: Response) => {
    const { segment } = req.query;
    const tradingSegment = (segment as string) || "spot";

    const binanceService = new BinanceService();
    binanceService.initializeWithCredentials("", "", false);

    let result;
    if (tradingSegment === "usdm") {
      result = await binanceService.testFuturesConnectivity();
    } else {
      result = await binanceService.testSpotConnectivity();
    }

    return res.json({
      ...result,
      success: true,
      segment: tradingSegment,
    });
  })
);

// POST /api/binance/leverage - Change leverage for futures (Authenticated)
router.post(
  "/leverage",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol, leverage } = req.body;
    const account = req.account!;

    if (!symbol || !leverage) {
      return res.status(400).json({
        error: "symbol and leverage are required",
      });
    }

    if (account.accountType !== "binance") {
      return res.status(400).json({ error: "Not a Binance account" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";

    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Leverage is only available for USD(S)-M Futures",
      });
    }

    const binanceService = BrokerFactory.getBinanceClient(account);

    const result = await binanceService.changeFuturesLeverage(symbol, leverage);

    return res.json({
      success: true,
      result,
    });
  })
);

// POST /api/binance/margin-type - Change margin type for futures (Authenticated)
router.post(
  "/margin-type",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol, marginType } = req.body;
    const account = req.account!;

    if (!symbol || !marginType) {
      return res.status(400).json({
        error: "symbol and marginType are required",
      });
    }

    if (account.accountType !== "binance") {
      return res.status(400).json({ error: "Not a Binance account" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";

    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Margin type is only available for USD(S)-M Futures",
      });
    }

    const binanceService = BrokerFactory.getBinanceClient(account);

    const result = await binanceService.changeFuturesMarginType(
      symbol,
      marginType,
    );

    return res.json({
      success: true,
      result,
    });
  })
);

// GET /api/binance/position-details - Get detailed position info including calculated values (Authenticated)
router.get(
  "/position-details",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol } = req.query;
    const account = req.account!;

    if (account.accountType !== "binance")
      return res.status(400).json({ error: "Not a Binance account" });

    const binanceService = BrokerFactory.getBinanceClient(account);

    const [
      accountInfo,
      positions,
      leverageBrackets,
      premiumIndex,
      exchangeInfo,
    ] = await Promise.all([
      binanceService.getFuturesAccount(),
      binanceService.getFuturesPositions(),
      binanceService.getFuturesLeverageBrackets(symbol as string),
      binanceService.getFuturesPremiumIndex(symbol as string),
      symbol ? binanceService.getFuturesExchangeInfo() : Promise.resolve(null),
    ]);

    let tickSize = "0.01";
    let stepSize = "0.001";
    if (exchangeInfo && symbol) {
      const symbolInfo = exchangeInfo.symbols?.find(
        (s: any) => s.symbol === symbol,
      );
      if (symbolInfo) {
        const priceFilter = symbolInfo.filters?.find(
          (f: any) => f.filterType === "PRICE_FILTER",
        );
        const lotSizeFilter = symbolInfo.filters?.find(
          (f: any) => f.filterType === "LOT_SIZE",
        );
        if (priceFilter?.tickSize) tickSize = priceFilter.tickSize;
        if (lotSizeFilter?.stepSize) stepSize = lotSizeFilter.stepSize;
      }
    }

    const totalMaintMargin = parseFloat(accountInfo.totalMaintMargin);
    const totalMarginBalance = parseFloat(accountInfo.totalMarginBalance);
    const totalUnrealizedProfit = parseFloat(accountInfo.totalUnrealizedProfit);
    const availableBalance = parseFloat(accountInfo.availableBalance);

    const accountMarginRatio =
      totalMarginBalance > 0
        ? (totalMaintMargin / totalMarginBalance) * 100
        : 0;

    let totalNotional = 0;
    positions.forEach((p: any) => {
      totalNotional += Math.abs(parseFloat(p.notional));
    });
    const actualAccountLeverage =
      totalMarginBalance > 0 ? totalNotional / totalMarginBalance : 0;

    let positionDetails = null;
    let symbolMaxLeverage = 20;

    if (symbol) {
      const position = positions.find(
        (p: any) => p.symbol === (symbol as string),
      );
      const bracket = Array.isArray(leverageBrackets)
        ? leverageBrackets[0]
        : leverageBrackets;
      const funding = Array.isArray(premiumIndex)
        ? premiumIndex.find((p: any) => p.symbol === symbol)
        : premiumIndex;

      if (bracket && bracket.brackets && bracket.brackets.length > 0) {
        symbolMaxLeverage = bracket.brackets[0].initialLeverage;
      }

      if (position) {
        const toSafeNumber = (value: unknown, fallback: number = 0): number => {
          if (value === null || value === undefined) return fallback;
          const num = typeof value === 'number' ? value : parseFloat(String(value));
          return Number.isFinite(num) ? num : fallback;
        };

        const entryPrice = toSafeNumber(position.entryPrice, 0);
        const markPrice = toSafeNumber(position.markPrice, 0);
        const size = toSafeNumber(position.positionAmt, 0);
        const leverage = toSafeNumber(position.leverage, 1);
        const unrealizedProfit = toSafeNumber(position.unRealizedProfit, 0);
        const initialMargin = toSafeNumber(position.initialMargin, 0);
        const maintMargin = toSafeNumber(position.maintMargin, 0);
        const marginBalance = toSafeNumber(position.marginBalance, 1);

        const roi =
          initialMargin > 0 ? (unrealizedProfit / initialMargin) * 100 : 0;

        const fundingRate = funding ? toSafeNumber(funding.lastFundingRate, 0) : 0;
        const estFundingFee = Math.abs(size * markPrice) * fundingRate;

        const TAKER_FEE = 0.0004;
        const breakEvenPrice =
          size > 0
            ? entryPrice * (1 + TAKER_FEE * 2)
            : entryPrice * (1 - TAKER_FEE * 2);

        positionDetails = {
          symbol: position.symbol,
          size,
          entryPrice,
          markPrice,
          liquidationPrice: toSafeNumber(position.liquidationPrice, 0),
          margin: initialMargin,
          marginRatio: marginBalance > 0 ? maintMargin / marginBalance : 0,
          pnl: unrealizedProfit,
          roi,
          estFundingFee,
          breakEvenPrice: Number.isFinite(breakEvenPrice) ? breakEvenPrice : entryPrice,
          leverage,
          marginType: position.marginType,
          maxLeverage: symbolMaxLeverage,
        };
      }
    }

    return res.json({
      success: true,
      account: {
        marginRatio: accountMarginRatio,
        maintenanceMargin: totalMaintMargin,
        equity: totalMarginBalance,
        availableBalance: availableBalance,
        positionValue: totalNotional,
        actualLeverage: actualAccountLeverage,
        unrealizedPNL: totalUnrealizedProfit,
      },
      position: positionDetails,
      symbolInfo: symbol
        ? {
            maxLeverage: symbolMaxLeverage,
            tickSize,
            stepSize,
          }
        : null,
    });
  })
);

// GET /api/binance/order-history - Get order history (Authenticated)
router.get(
  "/order-history",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol, limit, timeframe, page, pageSize } = req.query;
    const account = req.account!;

    if (account.accountType !== "binance") {
      return res.status(400).json({ error: "Not a Binance account" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Order history is only available for Binance futures accounts",
      });
    }

    const binanceService = BrokerFactory.getBinanceClient(account);

    const now = Date.now();
    let startTime: number | undefined;
    switch (timeframe) {
      case "7d":
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "30d":
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "90d":
        startTime = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case "24h":
      default:
        startTime = now - 24 * 60 * 60 * 1000;
        break;
    }

    const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSizeValue = Math.min(
      200,
      Math.max(
        1,
        parseInt((pageSize as string) || (limit as string), 10) || 50,
      ),
    );

    const fetchTarget = pageNumber * pageSizeValue + 1;

    const symbolsToFetch = await deriveHistorySymbols(
      binanceService,
      normalizeSymbol(symbol as string | undefined),
      startTime,
      now,
    );

    if (symbolsToFetch.length === 0) {
      return res.json({
        success: true,
        orders: [],
        message:
          "No symbols with activity found. Select a symbol to fetch history.",
      });
    }

    const perSymbolLimit = Math.max(
      10,
      Math.round(fetchTarget / symbolsToFetch.length),
    );

    const allOrders: any[] = [];
    for (const sym of symbolsToFetch) {
      try {
        const symbolOrders = await binanceService.getFuturesAllOrders(
          sym,
          perSymbolLimit,
          startTime,
          now,
        );
        allOrders.push(...symbolOrders);
      } catch (err: any) {
        console.warn(
          `Failed to fetch order history for ${sym}:`,
          err?.message || err,
        );
      }
    }

    const sortedOrders = allOrders
      .filter(
        (o: any) =>
          o.status === "FILLED" ||
          o.status === "CANCELED" ||
          o.status === "EXPIRED",
      )
      .sort(
        (a: any, b: any) =>
          (b.updateTime || b.time || 0) - (a.updateTime || a.time || 0),
      );

    const startIndex = (pageNumber - 1) * pageSizeValue;
    const pageOrders = sortedOrders.slice(
      startIndex,
      startIndex + pageSizeValue,
    );
    const hasMore = sortedOrders.length > startIndex + pageSizeValue;

    return res.json({
      success: true,
      page: pageNumber,
      pageSize: pageSizeValue,
      hasMore,
      orders: pageOrders.map((o: any) => ({
        id: o.orderId,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        quantity: parseFloat(o.origQty),
        executedQty: parseFloat(o.executedQty),
        price: parseFloat(o.price) || parseFloat(o.avgPrice),
        avgPrice: parseFloat(o.avgPrice),
        status: o.status,
        time: o.time,
        updateTime: o.updateTime,
      })),
    });
  })
);

// GET /api/binance/trade-history - Get trade history (executed trades) (Authenticated)
router.get(
  "/trade-history",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol, limit, timeframe, page, pageSize } = req.query;
    const account = req.account!;

    if (account.accountType !== "binance") {
      return res.status(400).json({ error: "Not a Binance account" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Trade history is only available for Binance futures accounts",
      });
    }

    const binanceService = BrokerFactory.getBinanceClient(account);

    const now = Date.now();
    let startTime: number | undefined;
    switch (timeframe) {
      case "7d":
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "30d":
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "90d":
        startTime = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case "24h":
      default:
        startTime = now - 24 * 60 * 60 * 1000;
        break;
    }

    const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSizeValue = Math.min(
      200,
      Math.max(
        1,
        parseInt((pageSize as string) || (limit as string), 10) || 50,
      ),
    );

    const fetchTarget = pageNumber * pageSizeValue + 1;

    const symbolsToFetch = await deriveHistorySymbols(
      binanceService,
      normalizeSymbol(symbol as string | undefined),
      startTime,
      now,
    );

    if (symbolsToFetch.length === 0) {
      return res.json({
        success: true,
        trades: [],
        message:
          "No symbols with activity found. Select a symbol to fetch history.",
      });
    }

    const perSymbolLimit = Math.max(
      10,
      Math.round(fetchTarget / symbolsToFetch.length),
    );

    const allTrades: any[] = [];
    for (const sym of symbolsToFetch) {
      try {
        const symbolTrades = await binanceService.getFuturesUserTrades(
          sym,
          perSymbolLimit,
          startTime,
          now,
        );
        allTrades.push(...symbolTrades);
      } catch (err: any) {
        console.warn(
          `Failed to fetch trade history for ${sym}:`,
          err?.message || err,
        );
      }
    }

    const sortedTrades = allTrades.sort(
      (a: any, b: any) => (b.time || 0) - (a.time || 0),
    );

    const startIndex = (pageNumber - 1) * pageSizeValue;
    const pageTrades = sortedTrades.slice(
      startIndex,
      startIndex + pageSizeValue,
    );
    const hasMore = sortedTrades.length > startIndex + pageSizeValue;

    return res.json({
      success: true,
      page: pageNumber,
      pageSize: pageSizeValue,
      hasMore,
      trades: pageTrades.map((t: any) => ({
        id: t.id,
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.side,
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        quoteQty: parseFloat(t.quoteQty),
        realizedPnl: parseFloat(t.realizedPnl),
        commission: parseFloat(t.commission),
        commissionAsset: t.commissionAsset,
        time: t.time,
        positionSide: t.positionSide,
        buyer: t.buyer,
        maker: t.maker,
      })),
    });
  })
);

export default router;
