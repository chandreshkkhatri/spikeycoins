import { Router, Response } from "express";
import GymSession, { IGymTrade, IGymSession } from "../models/gym-session";
import HistoricalDataCache from "../models/historical-data-cache";
import { requireAuth, AuthenticatedRequest } from "../lib/auth-middleware";
import axios from "axios";

const router: Router = Router();

// All gym routes require authentication
router.use(requireAuth);

// Helper: Calculate percentage PnL
function calcPctPnl(entryPrice: number, exitPrice: number, side: "LONG" | "SHORT"): number {
  if (side === "LONG") {
    return +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(4);
  }
  return +(((entryPrice - exitPrice) / entryPrice) * 100).toFixed(4);
}

// Supported symbols for gym practice
const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const SUPPORTED_INTERVALS = ["15m", "1h", "4h", "1d"];

// Interval to milliseconds mapping
const INTERVAL_MS: Record<string, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

// Config for secondary charts
const TIMEFRAME_CONFIGS: Record<string, { lower: string; lowerMultiplier: number; higher: string; higherMultiplier: number }> = {
  "15m": { lower: "5m", lowerMultiplier: 3, higher: "1h", higherMultiplier: 4 },
  "1h": { lower: "15m", lowerMultiplier: 4, higher: "4h", higherMultiplier: 4 },
  "4h": { lower: "1h", lowerMultiplier: 4, higher: "1d", higherMultiplier: 6 },
  "1d": { lower: "4h", lowerMultiplier: 6, higher: "1d", higherMultiplier: 1 },
};

// Helper: Fetch candles from cache or Binance in chunks of up to 1000
async function fetchCandles(
  symbol: string,
  interval: string,
  startTime: number,
  limit: number = 300
): Promise<Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>> {
  const marketType = "usdm";
  
  // Try cache first
  const cachedCandles = await HistoricalDataCache.find({
    symbol,
    interval,
    marketType,
    timestamp: { $gte: startTime },
  })
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();

  if (cachedCandles.length >= limit) {
    return cachedCandles.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      timestamp: c.timestamp,
    }));
  }

  // Fetch from Binance API in chunks
  const candles: Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }> = [];
  let currentStartTime = startTime;
  let remaining = limit;

  try {
    while (remaining > 0) {
      const chunkLimit = Math.min(remaining, 1000);
      const endTime = currentStartTime + chunkLimit * INTERVAL_MS[interval];
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStartTime}&endTime=${endTime}&limit=${chunkLimit}`;
      
      const response = await axios.get(url);
      const chunkCandles = response.data.map((k: unknown[]) => {
        const arr = k as [number, string, string, string, string, string];
        return {
          timestamp: arr[0],
          open: parseFloat(arr[1]),
          high: parseFloat(arr[2]),
          low: parseFloat(arr[3]),
          close: parseFloat(arr[4]),
          volume: parseFloat(arr[5]),
        };
      });

      if (chunkCandles.length === 0) break;

      candles.push(...chunkCandles);
      remaining -= chunkCandles.length;
      currentStartTime = chunkCandles[chunkCandles.length - 1].timestamp + INTERVAL_MS[interval];
    }

    // Cache the candles (fire and forget)
    if (candles.length > 0) {
      const candlesToInsert = candles.map((c) => ({
        symbol,
        interval,
        marketType,
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      HistoricalDataCache.insertMany(candlesToInsert, { ordered: false }).catch(() => {});
    }
  } catch (err: unknown) {
    console.error(`[fetchCandles] Error fetching ${interval} candles from Binance:`, err);
  }

  return candles;
}

// Helper: Obfuscate price series
function obfuscateSeries(
  candles: Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>,
  multiplier: number
): typeof candles {
  return candles.map((c, index) => ({
    open: +(c.open * multiplier).toFixed(2),
    high: +(c.high * multiplier).toFixed(2),
    low: +(c.low * multiplier).toFixed(2),
    close: +(c.close * multiplier).toFixed(2),
    volume: c.volume,
    timestamp: index,
  }));
}

// Helper: Format consistent response payload for a session
function formatSessionResponse(session: IGymSession) {
  const config = TIMEFRAME_CONFIGS[session.interval] || { lowerMultiplier: 4, higherMultiplier: 4 };
  const lowerCandleIndex = session.currentCandleIndex * config.lowerMultiplier;
  const higherCandleIndex = Math.floor(session.currentCandleIndex / config.higherMultiplier);
  const isRevealed = session.status === "REVEALED";

  return {
    id: session._id,
    interval: session.interval,
    currentCandleIndex: session.currentCandleIndex,
    totalCandles: session.candles.length,
    candles: session.candles.slice(0, session.currentCandleIndex),
    lowerInterval: session.lowerInterval,
    lowerCandles: session.lowerCandles ? session.lowerCandles.slice(0, lowerCandleIndex) : [],
    higherInterval: session.higherInterval,
    higherCandles: session.higherCandles ? session.higherCandles.slice(0, higherCandleIndex) : [],
    trades: session.trades,
    totalPnl: session.totalPnl,
    status: session.status,
    ...(isRevealed && {
      actualSymbol: session.actualSymbol,
      actualStartTimestamp: session.actualStartTimestamp,
    }),
  };
}

// GET /api/gym/session/active - Get the user's current active session
router.get("/session/active", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const session = await GymSession.findOne({ userId, status: "ACTIVE" });
    
    if (!session) {
      return res.json({ success: true, session: null });
    }

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error fetching active session:", error);
    return res.status(500).json({ error: "Failed to fetch active session" });
  }
});

// POST /api/gym/session/new - Create a new gym session
router.post("/session/new", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Pick random symbol and interval
    const symbol = SUPPORTED_SYMBOLS[Math.floor(Math.random() * SUPPORTED_SYMBOLS.length)];
    const interval = SUPPORTED_INTERVALS[Math.floor(Math.random() * SUPPORTED_INTERVALS.length)];
    const config = TIMEFRAME_CONFIGS[interval];

    // Pick random start date (between 2 years ago and 100 candles before now)
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    const minCandlesAhead = 300;
    const latestStart = Date.now() - minCandlesAhead * INTERVAL_MS[interval];
    const randomStartTime = Math.floor(twoYearsAgo + Math.random() * (latestStart - twoYearsAgo));

    // Fetch primary and secondary timeframe charts in parallel
    const [mainCandles, lowerCandlesRaw, higherCandlesRaw] = await Promise.all([
      fetchCandles(symbol, interval, randomStartTime, 300),
      fetchCandles(symbol, config.lower, randomStartTime, 300 * config.lowerMultiplier),
      fetchCandles(symbol, config.higher, randomStartTime, Math.ceil(300 / config.higherMultiplier)),
    ]);

    if (mainCandles.length < 100) {
      return res.status(500).json({ error: "Failed to fetch enough historical data" });
    }

    // Calculate multiplier based on main candles
    const maxHigh = Math.max(...mainCandles.map((c) => c.high));
    const randomFactor = Math.random() * 99 + 1;
    const multiplier = (100 / maxHigh) * randomFactor;

    // Obfuscate all series with the same multiplier
    const obfuscatedMain = obfuscateSeries(mainCandles, multiplier);
    const obfuscatedLower = obfuscateSeries(lowerCandlesRaw, multiplier);
    const obfuscatedHigher = obfuscateSeries(higherCandlesRaw, multiplier);

    // Create session
    const session = new GymSession({
      userId,
      actualSymbol: symbol,
      actualStartTimestamp: randomStartTime,
      interval,
      priceMultiplier: multiplier,
      candles: obfuscatedMain,
      lowerCandles: obfuscatedLower,
      lowerInterval: config.lower,
      higherCandles: obfuscatedHigher,
      higherInterval: config.higher,
      currentCandleIndex: 50,
      initialCandleCount: 50,
      trades: [],
      totalPnl: 0,
      status: "ACTIVE",
    });

    await session.save();

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error creating gym session:", error);
    return res.status(500).json({ error: "Failed to create gym session" });
  }
});

// GET /api/gym/session/:id - Get session state
router.get("/session/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error fetching gym session:", error);
    return res.status(500).json({ error: "Failed to fetch gym session" });
  }
});

// POST /api/gym/session/:id/wait - Advance time (reveal more candles) and check fills
router.post("/session/:id/wait", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { candlesToAdvance = 1 } = req.body;
    const session = await GymSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    const newIndex = Math.min(
      session.currentCandleIndex + candlesToAdvance,
      session.candles.length
    );

    const newCandles = session.candles.slice(session.currentCandleIndex, newIndex);

    for (const trade of session.trades) {
      if (
        trade.status === "CLOSED" ||
        trade.status === "STOPPED_OUT" ||
        trade.status === "TARGET_HIT" ||
        trade.status === "CANCELED"
      ) {
        continue;
      }

      for (let i = 0; i < newCandles.length; i++) {
        const candle = newCandles[i];
        const candleIndex = session.currentCandleIndex + i;

        // Fill pending limit orders if matched
        if (trade.status === "PENDING") {
          if (trade.side === "LONG") {
            if (candle.low <= trade.entryPrice) {
              trade.status = "OPEN";
              trade.entryCandle = candleIndex;
            }
          } else {
            if (candle.high >= trade.entryPrice) {
              trade.status = "OPEN";
              trade.entryCandle = candleIndex;
            }
          }
        }

        // Process open trades for SL/TP hits
        if (trade.status === "OPEN") {
          if (trade.side === "LONG") {
            if (candle.low <= trade.stopLoss) {
              trade.status = "STOPPED_OUT";
              trade.exitCandle = candleIndex;
              trade.exitPrice = trade.stopLoss;
              trade.pnl = calcPctPnl(trade.entryPrice, trade.stopLoss, "LONG");
              session.totalPnl += trade.pnl;
              break;
            }
            if (candle.high >= trade.takeProfit) {
              trade.status = "TARGET_HIT";
              trade.exitCandle = candleIndex;
              trade.exitPrice = trade.takeProfit;
              trade.pnl = calcPctPnl(trade.entryPrice, trade.takeProfit, "LONG");
              session.totalPnl += trade.pnl;
              break;
            }
          } else {
            if (candle.high >= trade.stopLoss) {
              trade.status = "STOPPED_OUT";
              trade.exitCandle = candleIndex;
              trade.exitPrice = trade.stopLoss;
              trade.pnl = calcPctPnl(trade.entryPrice, trade.stopLoss, "SHORT");
              session.totalPnl += trade.pnl;
              break;
            }
            if (candle.low <= trade.takeProfit) {
              trade.status = "TARGET_HIT";
              trade.exitCandle = candleIndex;
              trade.exitPrice = trade.takeProfit;
              trade.pnl = calcPctPnl(trade.entryPrice, trade.takeProfit, "SHORT");
              session.totalPnl += trade.pnl;
              break;
            }
          }
        }
      }
    }

    session.currentCandleIndex = newIndex;

    if (newIndex >= session.candles.length) {
      session.status = "COMPLETED";
    }

    await session.save();

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error advancing gym session:", error);
    return res.status(500).json({ error: "Failed to advance session" });
  }
});

// POST /api/gym/session/:id/trade - Open a new trade (MARKET or LIMIT)
router.post("/session/:id/trade", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { side, stopLoss, takeProfit, type = "MARKET", limitPrice } = req.body;

    if (!side || !["LONG", "SHORT"].includes(side)) {
      return res.status(400).json({ error: "side must be 'LONG' or 'SHORT'" });
    }
    if (typeof stopLoss !== "number" || typeof takeProfit !== "number") {
      return res.status(400).json({ error: "stopLoss and takeProfit are required" });
    }
    if (type === "LIMIT" && typeof limitPrice !== "number") {
      return res.status(400).json({ error: "limitPrice is required for LIMIT orders" });
    }

    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    // Restrict to one active trade/setup at a time
    const hasActiveSetup = session.trades.some((t) => t.status === "OPEN" || t.status === "PENDING");
    if (hasActiveSetup) {
      return res.status(400).json({ error: "Close or cancel existing setup before opening a new one" });
    }

    if (session.currentCandleIndex <= 0) {
      return res.status(400).json({ error: "No candles revealed yet" });
    }

    const currentCandle = session.candles[session.currentCandleIndex - 1];
    const entryPrice = type === "LIMIT" ? limitPrice : currentCandle.close;

    // Validate SL/TP
    if (side === "LONG") {
      if (stopLoss >= entryPrice) {
        return res.status(400).json({ error: "For LONG, stopLoss must be below entry price" });
      }
      if (takeProfit <= entryPrice) {
        return res.status(400).json({ error: "For LONG, takeProfit must be above entry price" });
      }
    } else {
      if (stopLoss <= entryPrice) {
        return res.status(400).json({ error: "For SHORT, stopLoss must be above entry price" });
      }
      if (takeProfit >= entryPrice) {
        return res.status(400).json({ error: "For SHORT, takeProfit must be below entry price" });
      }
    }

    const newTrade: IGymTrade = {
      entryCandle: session.currentCandleIndex - 1,
      exitCandle: null,
      side,
      entryPrice,
      exitPrice: null,
      stopLoss,
      takeProfit,
      pnl: null,
      status: type === "LIMIT" ? "PENDING" : "OPEN",
      type,
    };

    session.trades.push(newTrade);
    await session.save();

    return res.json({
      success: true,
      trade: newTrade,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error opening trade:", error);
    return res.status(500).json({ error: "Failed to open trade" });
  }
});

// POST /api/gym/session/:id/trade/cancel - Cancel a pending limit trade
router.post("/session/:id/trade/cancel", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const pendingTrade = session.trades.find((t) => t.status === "PENDING");
    if (!pendingTrade) {
      return res.status(400).json({ error: "No pending trade to cancel" });
    }

    pendingTrade.status = "CANCELED";
    await session.save();

    return res.json({
      success: true,
      trade: pendingTrade,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error cancelling pending trade:", error);
    return res.status(500).json({ error: "Failed to cancel pending trade" });
  }
});

// POST /api/gym/session/:id/close - Close open trade at current price
router.post("/session/:id/close", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const openTrade = session.trades.find((t) => t.status === "OPEN");
    if (!openTrade) {
      return res.status(400).json({ error: "No open trade to close" });
    }

    if (session.currentCandleIndex <= 0) {
      return res.status(400).json({ error: "No candles revealed yet" });
    }

    const currentCandle = session.candles[session.currentCandleIndex - 1];
    openTrade.exitCandle = session.currentCandleIndex - 1;
    openTrade.exitPrice = currentCandle.close;
    openTrade.status = "CLOSED";
    openTrade.pnl = calcPctPnl(openTrade.entryPrice, openTrade.exitPrice, openTrade.side);

    session.totalPnl += openTrade.pnl;
    await session.save();

    return res.json({
      success: true,
      trade: openTrade,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error closing trade:", error);
    return res.status(500).json({ error: "Failed to close trade" });
  }
});

// POST /api/gym/session/:id/reveal - Reveal actual symbol and date
router.post("/session/:id/reveal", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Close any open trades at current price before reveal
    const openTrade = session.trades.find((t) => t.status === "OPEN");
    if (openTrade && session.currentCandleIndex > 0) {
      const currentCandle = session.candles[session.currentCandleIndex - 1];
      openTrade.exitCandle = session.currentCandleIndex - 1;
      openTrade.exitPrice = currentCandle.close;
      openTrade.status = "CLOSED";
      openTrade.pnl = calcPctPnl(openTrade.entryPrice, openTrade.exitPrice, openTrade.side);
      session.totalPnl += openTrade.pnl;
    }

    session.status = "REVEALED";
    session.currentCandleIndex = session.candles.length; // Show all candles
    await session.save();

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  } catch (error: unknown) {
    console.error("Error revealing session:", error);
    return res.status(500).json({ error: "Failed to reveal session" });
  }
});

// GET /api/gym/sessions - Get user's session history
router.get("/sessions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user!.id;

    const sessions = await GymSession.find({ userId })
      .select("_id interval status totalPnl createdAt actualSymbol")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s._id,
        interval: s.interval,
        status: s.status,
        totalPnl: s.totalPnl,
        createdAt: s.createdAt,
        ...(s.status === "REVEALED" && { actualSymbol: s.actualSymbol }),
      })),
    });
  } catch (error: unknown) {
    console.error("Error fetching sessions:", error);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

export default router;
