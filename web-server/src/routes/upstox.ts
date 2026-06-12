import { Router, Request, Response } from "express";
import upstoxService from "../lib/upstox-service";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";

const router: Router = Router();

// Upstox-specific endpoints

// GET /api/upstox/market-data/ltp - Get LTP (Last Traded Price)
router.get(
  "/market-data/ltp",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const { instruments } = req.query;

    if (!instruments) {
      return res.status(400).json({ error: "instruments are required" });
    }

    if (account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    const upstoxClient = BrokerFactory.getUpstoxClient(account);

    const instrumentList = (instruments as string).split(",");
    const ltp = await upstoxClient.getLTP(instrumentList);

    return res.json({
      success: true,
      data: ltp,
    });
  })
);

// GET /api/upstox/market-data/ohlc - Get OHLC data
router.get(
  "/market-data/ohlc",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const { instruments } = req.query;

    if (!instruments) {
      return res.status(400).json({ error: "instruments are required" });
    }

    if (account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    const upstoxClient = BrokerFactory.getUpstoxClient(account);

    const instrumentList = (instruments as string).split(",");
    const ohlc = await upstoxClient.getOHLC(instrumentList);

    return res.json({
      success: true,
      data: ohlc,
    });
  })
);

// GET /api/upstox/market-data/quotes - Get market quotes
router.get(
  "/market-data/quotes",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const { instruments } = req.query;

    if (!instruments) {
      return res.status(400).json({ error: "instruments are required" });
    }

    if (account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    const upstoxClient = BrokerFactory.getUpstoxClient(account);

    const instrumentList = (instruments as string).split(",");
    const quotes = await upstoxClient.getQuote(instrumentList);

    return res.json({
      success: true,
      data: quotes,
    });
  })
);

// GET /api/upstox/market-data/authorize - Authorize WebSocket
router.get(
  "/market-data/authorize",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;

    if (account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({
        error: "Account not authenticated",
        code: "AUTH_REQUIRED",
        message:
          "Please re-authenticate your Upstox account to enable live market data.",
      });
    }

    const isSandbox = account.metadata?.sandbox || false;
    if (isSandbox) {
      return res.status(400).json({
        success: false,
        error: "WebSocket market data feed is not available in sandbox mode",
        code: "SANDBOX_NOT_SUPPORTED",
        sandbox: true,
      });
    }

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
        },
      );

      const authData = await authResponse.json();

      if (!authResponse.ok) {
        console.error("Upstox WebSocket auth failed:", authData);

        if (authResponse.status === 401) {
          return res.status(401).json({
            success: false,
            error: "Access token expired or invalid",
            code: "TOKEN_EXPIRED",
            message:
              "Your Upstox session has expired. Please re-authenticate from the Accounts page.",
          });
        }

        if (authData?.errors?.[0]?.message?.toLowerCase().includes("market")) {
          return res.status(503).json({
            success: false,
            error: "Market data not available",
            code: "MARKET_CLOSED",
            message:
              "Live market data is not available outside trading hours. Historical data will still be shown.",
          });
        }

        return res.status(authResponse.status).json({
          success: false,
          error: authData?.message || "Failed to authorize WebSocket",
          code: "AUTH_FAILED",
          details: authData,
        });
      }

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
        message:
          "Could not reach Upstox servers. Please check your internet connection.",
        details: fetchError.message,
      });
    }
  })
);

// POST /api/upstox/instruments/resolve - Resolve symbols to instrument keys (Optional Auth for generic resolution)
router.post(
  "/instruments/resolve",
  asyncHandler(async (req: Request, res: Response) => {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: "symbols array is required" });
    }

    const mappings = await upstoxService.resolveInstruments(symbols);

    return res.json({
      success: true,
      mappings,
    });
  })
);

// GET /api/upstox/market-data/proto - Get Protobuf schema
router.get(
  "/market-data/proto",
  asyncHandler(async (req: Request, res: Response) => {
    const fs = require("fs");
    const path = require("path");

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
  })
);

export default router;
