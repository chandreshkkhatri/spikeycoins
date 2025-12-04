import { Router, Request, Response } from "express";
import binanceService from "../lib/binance-service";
import binancePriceService from "../lib/binance-price-service";
import { getAccountById } from "../models/account";

const router = Router();
const AGGREGATED_HISTORY_SYMBOL_LIMIT = 5;

const normalizeSymbol = (symbol?: string) =>
  typeof symbol === "string" ? symbol.trim().toUpperCase() : undefined;

const deriveHistorySymbols = async (preferredSymbol?: string) => {
  if (preferredSymbol) {
    return [preferredSymbol];
  }

  try {
    const positions = await binanceService.getFuturesPositions();
    if (Array.isArray(positions)) {
      const positionSymbols = Array.from(
        new Set(
          positions
            .filter((p: any) => parseFloat(p.positionAmt) !== 0)
            .map((p: any) => p.symbol)
        )
      );
      if (positionSymbols.length > 0) {
        return positionSymbols.slice(0, AGGREGATED_HISTORY_SYMBOL_LIMIT);
      }
    }
  } catch (err) {
    console.warn("Failed to derive history symbols from positions:", err);
  }

  try {
    const openOrders = await binanceService.getFuturesOpenOrders();
    if (Array.isArray(openOrders)) {
      const orderSymbols = Array.from(
        new Set(openOrders.map((o: any) => o.symbol))
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

// GET /api/binance/price - Get current price for a symbol
// IMPORTANT: Uses websocket cache to avoid excessive API calls and rate limits
router.get("/price", async (req: Request, res: Response) => {
  try {
    const { symbol, segment } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const upperSymbol = (symbol as string).toUpperCase();
    const tradingSegment = (segment as string) || "usdm"; // Default to futures as that's what's cached

    // Use websocket-cached prices instead of REST API to avoid rate limits
    const cachedPrice = binancePriceService.getPrice(upperSymbol);

    if (!cachedPrice) {
      return res.status(404).json({
        error: "Price not found in cache",
        symbol: upperSymbol,
        hint: "Symbol may not exist or price service is still initializing. Try /api/prices endpoint instead.",
      });
    }

    // Format response to match Binance API structure
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
  } catch (error: any) {
    console.error("Error fetching Binance price:", error);
    return res.status(500).json({
      error: "Failed to fetch price",
      details: error.message,
    });
  }
});

// GET /api/binance/ticker - Get 24hr ticker statistics
// IMPORTANT: Uses websocket cache to avoid excessive API calls and rate limits
router.get("/ticker", async (req: Request, res: Response) => {
  try {
    const { symbol, segment } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const upperSymbol = (symbol as string).toUpperCase();
    const tradingSegment = (segment as string) || "usdm"; // Default to futures as that's what's cached

    // Use websocket-cached prices which include 24hr ticker data
    const cachedPrice = binancePriceService.getPrice(upperSymbol);

    if (!cachedPrice) {
      return res.status(404).json({
        error: "Ticker not found in cache",
        symbol: upperSymbol,
        hint: "Symbol may not exist or price service is still initializing.",
      });
    }

    // Format response to match Binance 24hr ticker structure
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
  } catch (error: any) {
    console.error("Error fetching Binance ticker:", error);
    return res.status(500).json({
      error: "Failed to fetch ticker",
      details: error.message,
    });
  }
});

// GET /api/binance/test - Test connectivity
router.get("/test", async (req: Request, res: Response) => {
  try {
    const { segment } = req.query;
    const tradingSegment = (segment as string) || "spot";

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
  } catch (error: any) {
    console.error("Error testing Binance connectivity:", error);
    return res.status(500).json({
      error: "Failed to test connectivity",
      details: error.message,
    });
  }
});

// POST /api/binance/leverage - Change leverage for futures
router.post("/leverage", async (req: Request, res: Response) => {
  try {
    const { accountId, symbol, leverage } = req.body;

    if (!accountId || !symbol || !leverage) {
      return res.status(400).json({
        error: "accountId, symbol, and leverage are required",
      });
    }

    const account = await getAccountById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
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

    const isTestnet = account.metadata?.testnet || false;

    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isTestnet
    );

    const result = await binanceService.changeFuturesLeverage(symbol, leverage);

    return res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("Error changing leverage:", error);
    return res.status(500).json({
      error: "Failed to change leverage",
      details: error.message,
    });
  }
});

// POST /api/binance/margin-type - Change margin type for futures
router.post("/margin-type", async (req: Request, res: Response) => {
  try {
    const { accountId, symbol, marginType } = req.body;

    if (!accountId || !symbol || !marginType) {
      return res.status(400).json({
        error: "accountId, symbol, and marginType are required",
      });
    }

    const account = await getAccountById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
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

    const isTestnet = account.metadata?.testnet || false;

    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isTestnet
    );

    const result = await binanceService.changeFuturesMarginType(
      symbol,
      marginType
    );

    return res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("Error changing margin type:", error);
    return res.status(500).json({
      error: "Failed to change margin type",
      details: error.message,
    });
  }
});

// GET /api/binance/position-details - Get detailed position info including calculated values
router.get("/position-details", async (req: Request, res: Response) => {
  try {
    const { accountId, symbol } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);
    if (!account) return res.status(404).json({ error: "Account not found" });
    if (account.accountType !== "binance") return res.status(400).json({ error: "Not a Binance account" });

    const isTestnet = account.metadata?.testnet || false;
    binanceService.initializeWithCredentials(account.apiKey, account.apiSecret, isTestnet);

    // Fetch all necessary data in parallel
    const [accountInfo, positions, leverageBrackets, premiumIndex, exchangeInfo] = await Promise.all([
      binanceService.getFuturesAccount(),
      binanceService.getFuturesPositions(),
      binanceService.getFuturesLeverageBrackets(symbol as string),
      binanceService.getFuturesPremiumIndex(symbol as string),
      symbol ? binanceService.getFuturesExchangeInfo() : Promise.resolve(null)
    ]);

    // Get symbol filters for tick size and quantity precision
    let tickSize = "0.01";
    let stepSize = "0.001";
    if (exchangeInfo && symbol) {
      const symbolInfo = exchangeInfo.symbols?.find((s: any) => s.symbol === symbol);
      if (symbolInfo) {
        const priceFilter = symbolInfo.filters?.find((f: any) => f.filterType === "PRICE_FILTER");
        const lotSizeFilter = symbolInfo.filters?.find((f: any) => f.filterType === "LOT_SIZE");
        if (priceFilter?.tickSize) tickSize = priceFilter.tickSize;
        if (lotSizeFilter?.stepSize) stepSize = lotSizeFilter.stepSize;
      }
    }

    // 1. Account Level Calculations
    const totalMaintMargin = parseFloat(accountInfo.totalMaintMargin);
    const totalMarginBalance = parseFloat(accountInfo.totalMarginBalance);
    const totalPositionInitialMargin = parseFloat(accountInfo.totalPositionInitialMargin);
    const totalUnrealizedProfit = parseFloat(accountInfo.totalUnrealizedProfit);
    const availableBalance = parseFloat(accountInfo.availableBalance);
    
    // Account Margin Ratio = Maintenance Margin / Margin Balance
    const accountMarginRatio = totalMarginBalance > 0 ? (totalMaintMargin / totalMarginBalance) * 100 : 0;
    
    // Actual Leverage = Total Notional / Margin Balance
    // Note: totalNotional isn't directly in accountInfo v2, usually sum of abs(position.notional)
    // But we can approximate or calculate from positions if needed. 
    // For now, let's use what we have or calculate from positions list.
    let totalNotional = 0;
    positions.forEach((p: any) => {
      totalNotional += Math.abs(parseFloat(p.notional));
    });
    const actualAccountLeverage = totalMarginBalance > 0 ? totalNotional / totalMarginBalance : 0;

    // 2. Position Level Calculations (if symbol provided)
    let positionDetails = null;
    let symbolMaxLeverage = 20; // Default safe value

    if (symbol) {
      const position = positions.find((p: any) => p.symbol === symbol as string);
      const bracket = Array.isArray(leverageBrackets) ? leverageBrackets[0] : leverageBrackets; // if symbol passed, returns object or array of 1
      const funding = Array.isArray(premiumIndex) ? premiumIndex.find((p: any) => p.symbol === symbol) : premiumIndex;
      
      // Get max leverage from brackets
      if (bracket && bracket.brackets && bracket.brackets.length > 0) {
        symbolMaxLeverage = bracket.brackets[0].initialLeverage;
      }

      if (position) {
        const entryPrice = parseFloat(position.entryPrice);
        const markPrice = parseFloat(position.markPrice);
        const size = parseFloat(position.positionAmt);
        const leverage = parseFloat(position.leverage);
        const unrealizedProfit = parseFloat(position.unRealizedProfit);
        const initialMargin = parseFloat(position.initialMargin); // Position Margin
        
        // ROI %
        const roi = initialMargin > 0 ? (unrealizedProfit / initialMargin) * 100 : 0;

        // Est. Funding Fee = Size * Mark Price * Funding Rate
        const fundingRate = funding ? parseFloat(funding.lastFundingRate) : 0;
        const estFundingFee = Math.abs(size * markPrice) * fundingRate;

        // Break Even Price (Approximate, ignoring fees for now or using standard 0.04% taker)
        // Long: Entry * (1 + fee), Short: Entry * (1 - fee)
        const TAKER_FEE = 0.0004; // 0.04%
        const breakEvenPrice = size > 0 
          ? entryPrice * (1 + TAKER_FEE * 2) // Entry + Exit fee
          : entryPrice * (1 - TAKER_FEE * 2);

        positionDetails = {
          symbol: position.symbol,
          size,
          entryPrice,
          markPrice,
          liquidationPrice: parseFloat(position.liquidationPrice),
          margin: initialMargin,
          marginRatio: position.maintMargin / position.marginBalance, // Position specific if isolated
          pnl: unrealizedProfit,
          roi,
          estFundingFee,
          breakEvenPrice,
          leverage,
          marginType: position.marginType,
          maxLeverage: symbolMaxLeverage
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
        unrealizedPNL: totalUnrealizedProfit
      },
      position: positionDetails,
      symbolInfo: symbol ? {
        maxLeverage: symbolMaxLeverage,
        tickSize,
        stepSize
      } : null
    });

  } catch (error: any) {
    console.error("Error fetching position details:", error);
    return res.status(500).json({
      error: "Failed to fetch position details",
      details: error.message,
    });
  }
});

// GET /api/binance/order-history - Get order history
router.get("/order-history", async (req: Request, res: Response) => {
  try {
    const { accountId, symbol, limit } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);
    if (!account || account.accountType !== "binance") {
      return res.status(404).json({ error: "Binance account not found" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Order history is only available for Binance futures accounts",
      });
    }

    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      account.metadata?.testnet ?? false
    );

    const limitValue = parseInt(limit as string, 10) || 50;
    const symbolsToFetch = await deriveHistorySymbols(
      normalizeSymbol(symbol as string | undefined)
    );

    if (symbolsToFetch.length === 0) {
      return res.json({
        success: true,
        orders: [],
        message: "No symbols with activity found. Select a symbol to fetch history.",
      });
    }

    const perSymbolLimit = Math.max(
      10,
      Math.round(limitValue / symbolsToFetch.length)
    );

    const allOrders: any[] = [];
    for (const sym of symbolsToFetch) {
      try {
        const symbolOrders = await binanceService.getFuturesAllOrders(
          sym,
          perSymbolLimit
        );
        allOrders.push(...symbolOrders);
      } catch (err: any) {
        console.warn(`Failed to fetch order history for ${sym}:`, err?.message || err);
      }
    }

    const historyOrders = allOrders
      .filter(
        (o: any) =>
          o.status === "FILLED" ||
          o.status === "CANCELED" ||
          o.status === "EXPIRED"
      )
      .sort(
        (a: any, b: any) =>
          (b.updateTime || b.time || 0) - (a.updateTime || a.time || 0)
      )
      .slice(0, limitValue);

    return res.json({
      success: true,
      orders: historyOrders.map((o: any) => ({
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
  } catch (error: any) {
    console.error("Error fetching order history:", error);
    return res.status(500).json({
      error: "Failed to fetch order history",
      details: error.message,
    });
  }
});

// GET /api/binance/trade-history - Get trade history (executed trades)
router.get("/trade-history", async (req: Request, res: Response) => {
  try {
    const { accountId, symbol, limit } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);
    if (!account || account.accountType !== "binance") {
      return res.status(404).json({ error: "Binance account not found" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Trade history is only available for Binance futures accounts",
      });
    }

    binanceService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      account.metadata?.testnet ?? false
    );

    const limitValue = parseInt(limit as string, 10) || 50;
    const symbolsToFetch = await deriveHistorySymbols(
      normalizeSymbol(symbol as string | undefined)
    );

    if (symbolsToFetch.length === 0) {
      return res.json({
        success: true,
        trades: [],
        message: "No symbols with activity found. Select a symbol to fetch history.",
      });
    }

    const perSymbolLimit = Math.max(
      10,
      Math.round(limitValue / symbolsToFetch.length)
    );

    const allTrades: any[] = [];
    for (const sym of symbolsToFetch) {
      try {
        const symbolTrades = await binanceService.getFuturesUserTrades(
          sym,
          perSymbolLimit
        );
        allTrades.push(...symbolTrades);
      } catch (err: any) {
        console.warn(`Failed to fetch trade history for ${sym}:`, err?.message || err);
      }
    }

    const normalizedTrades = allTrades
      .sort((a: any, b: any) => (b.time || 0) - (a.time || 0))
      .slice(0, limitValue);

    return res.json({
      success: true,
      trades: normalizedTrades.map((t: any) => ({
        id: t.id,
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
  } catch (error: any) {
    console.error("Error fetching trade history:", error);
    return res.status(500).json({
      error: "Failed to fetch trade history",
      details: error.message,
    });
  }
});

export default router;
