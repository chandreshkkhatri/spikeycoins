import { Router, Request, Response } from "express";
import upstoxService from "../lib/upstox-service";
import { getAccountById } from "../models/account";

const router = Router();

// Upstox-specific endpoints

// GET /api/upstox/market-data/ltp - Get LTP (Last Traded Price)
router.get("/market-data/ltp", async (req: Request, res: Response) => {
  try {
    const { accountId, instruments } = req.query;

    if (!accountId || !instruments) {
      return res
        .status(400)
        .json({ error: "accountId and instruments are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    const isSandbox = account.metadata?.sandbox || false;
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox,
    );
    upstoxService.setAccessToken(account.accessToken);

    const instrumentList = (instruments as string).split(",");
    const ltp = await upstoxService.getLTP(instrumentList);

    return res.json({
      success: true,
      data: ltp,
    });
  } catch (error: any) {
    console.error("Error fetching LTP:", error);
    return res.status(500).json({
      error: "Failed to fetch LTP",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/ohlc - Get OHLC data
router.get("/market-data/ohlc", async (req: Request, res: Response) => {
  try {
    const { accountId, instruments } = req.query;

    if (!accountId || !instruments) {
      return res
        .status(400)
        .json({ error: "accountId and instruments are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    const isSandbox = account.metadata?.sandbox || false;
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox,
    );
    upstoxService.setAccessToken(account.accessToken);

    const instrumentList = (instruments as string).split(",");
    const ohlc = await upstoxService.getOHLC(instrumentList);

    return res.json({
      success: true,
      data: ohlc,
    });
  } catch (error: any) {
    console.error("Error fetching OHLC:", error);
    return res.status(500).json({
      error: "Failed to fetch OHLC",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/quotes - Get market quotes
router.get("/market-data/quotes", async (req: Request, res: Response) => {
  try {
    const { accountId, instruments } = req.query;

    if (!accountId || !instruments) {
      return res
        .status(400)
        .json({ error: "accountId and instruments are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    const isSandbox = account.metadata?.sandbox || false;
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox,
    );
    upstoxService.setAccessToken(account.accessToken);

    const instrumentList = (instruments as string).split(",");
    const quotes = await upstoxService.getQuote(instrumentList);

    return res.json({
      success: true,
      data: quotes,
    });
  } catch (error: any) {
    console.error("Error fetching quotes:", error);
    return res.status(500).json({
      error: "Failed to fetch quotes",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/authorize - Authorize WebSocket
router.get("/market-data/authorize", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({
        error: "Account not authenticated",
        code: "AUTH_REQUIRED",
        message: "Please re-authenticate your Upstox account to enable live market data."
      });
    }

    // Check if sandbox account - WebSocket not supported in sandbox mode
    const isSandbox = account.metadata?.sandbox || false;
    if (isSandbox) {
      return res.status(400).json({
        success: false,
        error: "WebSocket market data feed is not available in sandbox mode",
        code: "SANDBOX_NOT_SUPPORTED",
        sandbox: true,
      });
    }

    // Call Upstox API to get authorized WebSocket URL
    // This is required - direct WebSocket connection with access_token doesn't work
    try {
      const authResponse = await fetch(
        "https://api.upstox.com/v2/feed/market-data-feed/authorize",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${account.accessToken}`,
            "Api-Version": "2.0",
          },
        }
      );

      const authData = await authResponse.json();

      if (!authResponse.ok) {
        console.error("Upstox WebSocket auth failed:", authData);

        // Check for specific error codes
        if (authResponse.status === 401) {
          return res.status(401).json({
            success: false,
            error: "Access token expired or invalid",
            code: "TOKEN_EXPIRED",
            message: "Your Upstox session has expired. Please re-authenticate from the Accounts page.",
          });
        }

        // Check if market is closed
        if (authData?.errors?.[0]?.message?.toLowerCase().includes("market")) {
          return res.status(503).json({
            success: false,
            error: "Market data not available",
            code: "MARKET_CLOSED",
            message: "Live market data is not available outside trading hours. Historical data will still be shown.",
          });
        }

        return res.status(authResponse.status).json({
          success: false,
          error: authData?.message || "Failed to authorize WebSocket",
          code: "AUTH_FAILED",
          details: authData,
        });
      }

      // Upstox returns the authorized WebSocket URL in data.authorizedRedirectUri
      const wsUrl = authData?.data?.authorizedRedirectUri;

      if (!wsUrl) {
        console.error("No WebSocket URL in Upstox response:", authData);
        return res.status(500).json({
          success: false,
          error: "Invalid response from Upstox",
          code: "INVALID_RESPONSE",
        });
      }

      return res.json({
        success: true,
        url: wsUrl,
      });
    } catch (fetchError: any) {
      console.error("Error calling Upstox WebSocket auth API:", fetchError);
      return res.status(503).json({
        success: false,
        error: "Unable to connect to Upstox",
        code: "CONNECTION_ERROR",
        message: "Could not reach Upstox servers. Please check your internet connection.",
        details: fetchError.message,
      });
    }
  } catch (error: any) {
    console.error("Error authorizing Upstox WebSocket:", error);
    return res.status(500).json({
      error: "Failed to authorize WebSocket",
      details: error.message,
    });
  }
});

// POST /api/upstox/instruments/resolve - Resolve symbols to instrument keys
router.post("/instruments/resolve", async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: "symbols array is required" });
    }

    const mappings = await upstoxService.resolveInstruments(symbols);

    return res.json({
      success: true,
      mappings,
    });
  } catch (error: any) {
    console.error("Error resolving instruments:", error);
    return res.status(500).json({
      error: "Failed to resolve instruments",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/proto - Get Protobuf schema
router.get("/market-data/proto", async (req: Request, res: Response) => {
  try {
    const fs = require("fs");
    const path = require("path");

    // Try to find the proto file in potential locations
    const possiblePaths = [
      path.join(process.cwd(), "src", "proto", "MarketDataFeed.proto"),
      path.join(process.cwd(), "proto", "MarketDataFeed.proto"),
      path.join(__dirname, "../../src/proto/MarketDataFeed.proto"),
    ];

    let protoPath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        protoPath = p;
        break;
      }
    }

    if (!protoPath) {
      console.error("Proto file not found in paths:", possiblePaths);
      return res.status(404).json({ error: "Proto definition not found" });
    }

    const content = fs.readFileSync(protoPath, "utf-8");
    res.setHeader("Content-Type", "text/plain");
    return res.send(content);
  } catch (error: any) {
    console.error("Error serving proto file:", error);
    return res.status(500).json({
      error: "Failed to serve proto file",
      details: error.message,
    });
  }
});

export default router;
