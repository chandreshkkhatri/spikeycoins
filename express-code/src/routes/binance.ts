import { Router, Request, Response } from "express";
import binanceService from "../lib/binance-service";
import { getAccountById } from "../models/account";

const router = Router();

// GET /api/binance/price - Get current price for a symbol
router.get("/price", async (req: Request, res: Response) => {
  try {
    const { symbol, segment } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const tradingSegment = (segment as string) || "spot";

    // Initialize with default credentials (no authentication needed for public endpoints)
    binanceService.initializeWithCredentials("", "", false);

    let price;
    if (tradingSegment === "usdm") {
      price = await binanceService.getFuturesPrice(symbol as string);
    } else {
      price = await binanceService.getSpotPrice(symbol as string);
    }

    return res.json({
      success: true,
      price,
      segment: tradingSegment,
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
router.get("/ticker", async (req: Request, res: Response) => {
  try {
    const { symbol, segment } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const tradingSegment = (segment as string) || "spot";

    binanceService.initializeWithCredentials("", "", false);

    let ticker;
    if (tradingSegment === "usdm") {
      ticker = await binanceService.getFutures24hrTicker(symbol as string);
    } else {
      ticker = await binanceService.getSpot24hrTicker(symbol as string);
    }

    return res.json({
      success: true,
      ticker,
      segment: tradingSegment,
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

export default router;
