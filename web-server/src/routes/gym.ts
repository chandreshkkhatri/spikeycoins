import { Router, Request, Response } from "express";
import GymSession, { IGymTrade } from "../models/gym-session";
import HistoricalDataCache from "../models/historical-data-cache";
import axios from "axios";

const router: Router = Router();

// Supported symbols for gym practice
const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const SUPPORTED_INTERVALS = ["15m", "1h", "4h", "1d"];

// Interval to milliseconds mapping
const INTERVAL_MS: Record<string, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

// Helper: Fetch candles from cache or Binance
async function fetchCandles(
  symbol: string,
  interval: string,
  startTime: number,
  limit: number = 300
): Promise<Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>> {
  const marketType = "binance-futures";
  
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

  // Fetch from Binance API
  const endTime = startTime + limit * INTERVAL_MS[interval];
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
  
  const response = await axios.get(url);
  const candles = response.data.map((k: any[]) => ({
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));

  // Cache the candles (fire and forget)
  if (candles.length > 0) {
    const candlesToInsert = candles.map((c: any) => ({
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

  return candles;
}

// Helper: Obfuscate prices
function obfuscatePrices(
  candles: Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>
): { obfuscated: typeof candles; multiplier: number } {
  const maxHigh = Math.max(...candles.map((c) => c.high));
  const randomFactor = Math.random() * 99 + 1; // 1-100
  const multiplier = (100 / maxHigh) * randomFactor;

  const obfuscated = candles.map((c, index) => ({
    open: +(c.open * multiplier).toFixed(2),
    high: +(c.high * multiplier).toFixed(2),
    low: +(c.low * multiplier).toFixed(2),
    close: +(c.close * multiplier).toFixed(2),
    volume: c.volume, // Keep volume as-is (less identifying)
    timestamp: index, // Replace timestamp with index to hide time
  }));

  return { obfuscated, multiplier };
}

// POST /api/gym/session/new - Create a new gym session
router.post("/session/new", async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Pick random symbol and interval
    const symbol = SUPPORTED_SYMBOLS[Math.floor(Math.random() * SUPPORTED_SYMBOLS.length)];
    const interval = SUPPORTED_INTERVALS[Math.floor(Math.random() * SUPPORTED_INTERVALS.length)];

    // Pick random start date (between 2 years ago and 100 candles before now)
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    const minCandlesAhead = 300; // Need at least 300 candles for the session
    const latestStart = Date.now() - minCandlesAhead * INTERVAL_MS[interval];
    const randomStartTime = Math.floor(twoYearsAgo + Math.random() * (latestStart - twoYearsAgo));

    // Fetch candles
    const candles = await fetchCandles(symbol, interval, randomStartTime, 300);
    if (candles.length < 100) {
      return res.status(500).json({ error: "Failed to fetch enough historical data" });
    }

    // Obfuscate prices
    const { obfuscated, multiplier } = obfuscatePrices(candles);

    // Create session
    const session = new GymSession({
      userId,
      actualSymbol: symbol,
      actualStartTimestamp: randomStartTime,
      interval,
      priceMultiplier: multiplier,
      candles: obfuscated,
      currentCandleIndex: 50, // Start with 50 candles visible
      initialCandleCount: 50,
      trades: [],
      totalPnl: 0,
      status: "ACTIVE",
    });

    await session.save();

    // Return session without revealing hidden data
    res.json({
      success: true,
      session: {
        id: session._id,
        interval,
        currentCandleIndex: session.currentCandleIndex,
        totalCandles: session.candles.length,
        candles: session.candles.slice(0, session.currentCandleIndex),
        trades: session.trades,
        totalPnl: session.totalPnl,
        status: session.status,
      },
    });
  } catch (error: any) {
    console.error("Error creating gym session:", error);
    res.status(500).json({ error: "Failed to create gym session" });
  }
});

// GET /api/gym/session/:id - Get session state
router.get("/session/:id", async (req: Request, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const isRevealed = session.status === "REVEALED";

    res.json({
      success: true,
      session: {
        id: session._id,
        interval: session.interval,
        currentCandleIndex: session.currentCandleIndex,
        totalCandles: session.candles.length,
        candles: session.candles.slice(0, session.currentCandleIndex),
        trades: session.trades,
        totalPnl: session.totalPnl,
        status: session.status,
        // Only reveal if session is completed
        ...(isRevealed && {
          actualSymbol: session.actualSymbol,
          actualStartTimestamp: session.actualStartTimestamp,
        }),
      },
    });
  } catch (error: any) {
    console.error("Error fetching gym session:", error);
    res.status(500).json({ error: "Failed to fetch gym session" });
  }
});

// POST /api/gym/session/:id/wait - Advance time (reveal more candles)
router.post("/session/:id/wait", async (req: Request, res: Response) => {
  try {
    const { candlesToAdvance = 1 } = req.body;
    const session = await GymSession.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    const newIndex = Math.min(
      session.currentCandleIndex + candlesToAdvance,
      session.candles.length
    );

    // Check if any open trades hit SL/TP during the new candles
    const newCandles = session.candles.slice(session.currentCandleIndex, newIndex);
    
    for (const trade of session.trades) {
      if (trade.status !== "OPEN") continue;

      for (let i = 0; i < newCandles.length; i++) {
        const candle = newCandles[i];
        const candleIndex = session.currentCandleIndex + i;
        
        if (trade.side === "LONG") {
          // Check SL hit (low <= stopLoss)
          if (candle.low <= trade.stopLoss) {
            trade.status = "STOPPED_OUT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.stopLoss;
            trade.pnl = trade.stopLoss - trade.entryPrice;
            session.totalPnl += trade.pnl;
            break;
          }
          // Check TP hit (high >= takeProfit)
          if (candle.high >= trade.takeProfit) {
            trade.status = "TARGET_HIT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.takeProfit;
            trade.pnl = trade.takeProfit - trade.entryPrice;
            session.totalPnl += trade.pnl;
            break;
          }
        } else {
          // SHORT
          // Check SL hit (high >= stopLoss)
          if (candle.high >= trade.stopLoss) {
            trade.status = "STOPPED_OUT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.stopLoss;
            trade.pnl = trade.entryPrice - trade.stopLoss;
            session.totalPnl += trade.pnl;
            break;
          }
          // Check TP hit (low <= takeProfit)
          if (candle.low <= trade.takeProfit) {
            trade.status = "TARGET_HIT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.takeProfit;
            trade.pnl = trade.entryPrice - trade.takeProfit;
            session.totalPnl += trade.pnl;
            break;
          }
        }
      }
    }

    session.currentCandleIndex = newIndex;

    // Check if we've run out of candles
    if (newIndex >= session.candles.length) {
      session.status = "COMPLETED";
    }

    await session.save();

    res.json({
      success: true,
      session: {
        id: session._id,
        currentCandleIndex: session.currentCandleIndex,
        totalCandles: session.candles.length,
        candles: session.candles.slice(0, session.currentCandleIndex),
        trades: session.trades,
        totalPnl: session.totalPnl,
        status: session.status,
      },
    });
  } catch (error: any) {
    console.error("Error advancing gym session:", error);
    res.status(500).json({ error: "Failed to advance session" });
  }
});

// POST /api/gym/session/:id/trade - Open a new trade
router.post("/session/:id/trade", async (req: Request, res: Response) => {
  try {
    const { side, stopLoss, takeProfit } = req.body;
    
    if (!side || !["LONG", "SHORT"].includes(side)) {
      return res.status(400).json({ error: "side must be 'LONG' or 'SHORT'" });
    }
    if (typeof stopLoss !== "number" || typeof takeProfit !== "number") {
      return res.status(400).json({ error: "stopLoss and takeProfit are required" });
    }

    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    // Check for existing open trade
    const hasOpenTrade = session.trades.some((t) => t.status === "OPEN");
    if (hasOpenTrade) {
      return res.status(400).json({ error: "Close existing trade before opening a new one" });
    }

    // Get current price (close of last visible candle)
    const currentCandle = session.candles[session.currentCandleIndex - 1];
    const entryPrice = currentCandle.close;

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
      status: "OPEN",
    };

    session.trades.push(newTrade);
    await session.save();

    res.json({
      success: true,
      trade: newTrade,
      session: {
        id: session._id,
        trades: session.trades,
        totalPnl: session.totalPnl,
      },
    });
  } catch (error: any) {
    console.error("Error opening trade:", error);
    res.status(500).json({ error: "Failed to open trade" });
  }
});

// POST /api/gym/session/:id/close - Close open trade at current price
router.post("/session/:id/close", async (req: Request, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const openTrade = session.trades.find((t) => t.status === "OPEN");
    if (!openTrade) {
      return res.status(400).json({ error: "No open trade to close" });
    }

    // Close at current price
    const currentCandle = session.candles[session.currentCandleIndex - 1];
    openTrade.exitCandle = session.currentCandleIndex - 1;
    openTrade.exitPrice = currentCandle.close;
    openTrade.status = "CLOSED";

    if (openTrade.side === "LONG") {
      openTrade.pnl = openTrade.exitPrice - openTrade.entryPrice;
    } else {
      openTrade.pnl = openTrade.entryPrice - openTrade.exitPrice;
    }

    session.totalPnl += openTrade.pnl;
    await session.save();

    res.json({
      success: true,
      trade: openTrade,
      session: {
        id: session._id,
        trades: session.trades,
        totalPnl: session.totalPnl,
      },
    });
  } catch (error: any) {
    console.error("Error closing trade:", error);
    res.status(500).json({ error: "Failed to close trade" });
  }
});

// POST /api/gym/session/:id/reveal - Reveal actual symbol and date
router.post("/session/:id/reveal", async (req: Request, res: Response) => {
  try {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Close any open trades at current price before reveal
    const openTrade = session.trades.find((t) => t.status === "OPEN");
    if (openTrade) {
      const currentCandle = session.candles[session.currentCandleIndex - 1];
      openTrade.exitCandle = session.currentCandleIndex - 1;
      openTrade.exitPrice = currentCandle.close;
      openTrade.status = "CLOSED";

      if (openTrade.side === "LONG") {
        openTrade.pnl = openTrade.exitPrice - openTrade.entryPrice;
      } else {
        openTrade.pnl = openTrade.entryPrice - openTrade.exitPrice;
      }

      session.totalPnl += openTrade.pnl;
    }

    session.status = "REVEALED";
    await session.save();

    res.json({
      success: true,
      session: {
        id: session._id,
        actualSymbol: session.actualSymbol,
        actualStartTimestamp: session.actualStartTimestamp,
        interval: session.interval,
        priceMultiplier: session.priceMultiplier,
        trades: session.trades,
        totalPnl: session.totalPnl,
        status: session.status,
      },
    });
  } catch (error: any) {
    console.error("Error revealing session:", error);
    res.status(500).json({ error: "Failed to reveal session" });
  }
});

// GET /api/gym/sessions - Get user's session history
router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const { userId, limit = 10 } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const sessions = await GymSession.find({ userId })
      .select("_id interval status totalPnl createdAt actualSymbol")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s._id,
        interval: s.interval,
        status: s.status,
        totalPnl: s.totalPnl,
        createdAt: s.createdAt,
        // Only show symbol if revealed
        ...(s.status === "REVEALED" && { actualSymbol: s.actualSymbol }),
      })),
    });
  } catch (error: any) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

export default router;
