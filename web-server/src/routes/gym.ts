import { Router, Response, NextFunction, RequestHandler } from "express";
import GymSession, { IGymSession, IGymTrade } from "../models/gym-session";
import GymDrill from "../models/gym-drill";
import { requireAuth, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import {
  SUPPORTED_SYMBOLS,
  SUPPORTED_INTERVALS,
  TIMEFRAME_CONFIGS,
  INTERVAL_MS,
  fetchCandles,
  obfuscateSeries,
  calculateVolumeDivisor,
  snapToInterval,
  advance,
  recomputeTotals,
  formatSessionResponse,
  closeTrade,
  getInitialStop,
  atr,
  getMethodologyRulesPayload,
  validateThesis,
  evaluateGovernor,
  findPivots,
  gradePivotDrill,
  evaluateMomentum,
  evaluateAlignment,
  generateProcessScorecard,
  calculatePearsonCorrelation,
} from "../gym";

const router: Router = Router();

// Only observed candles (including the hidden warm-up prefix) inform entry risk.
function currentAtr(session: IGymSession): number {
  const values = atr([
    ...(session.warmupCandles ?? []),
    ...session.candles.slice(0, session.currentCandleIndex),
  ]);
  return values[values.length - 1] ?? 0;
}

async function saveSession(session: IGymSession): Promise<void> {
  recomputeTotals(session);
  if (session.mode === "METHOD") {
    evaluateGovernor(session);
    if (session.status === "ACTIVE") {
      // Discard snapshots saved by older clients before the session finished.
      session.scorecard = undefined;
    } else {
      session.endedAt ??= new Date();
      session.scorecard = generateProcessScorecard(session);
    }
  }
  await session.save();
}

// All gym routes require authentication
router.use(requireAuth);

// GET /api/gym/rules - Get frozen methodology rules payload
router.get("/rules", (_req, res) => {
  return res.json({
    success: true,
    rules: getMethodologyRulesPayload(),
  });
});

export interface GymRequest extends AuthenticatedRequest {
  gymSession?: IGymSession;
}

/**
 * Middleware: Load owned session and attach to request
 */
export const loadOwnedSession: RequestHandler = asyncHandler(
  async (req: GymRequest, res: Response, next: NextFunction) => {
    const session = await GymSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    req.gymSession = session;
    return next();
  }
);

// GET /api/gym/session/active - Get the user's current active session
router.get(
  "/session/active",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const session = await GymSession.findOne({ userId, status: "ACTIVE" });

    if (!session) {
      return res.json({ success: true, session: null });
    }

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  })
);

// POST /api/gym/session/new - Create a new gym session
router.post(
  "/session/new",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { mode = "FREE" } = req.body;

    const symbol = SUPPORTED_SYMBOLS[Math.floor(Math.random() * SUPPORTED_SYMBOLS.length)];
    const interval = SUPPORTED_INTERVALS[Math.floor(Math.random() * SUPPORTED_INTERVALS.length)];
    const config = TIMEFRAME_CONFIGS[interval];

    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    const minCandlesAhead = 300;
    const latestStart = Date.now() - minCandlesAhead * INTERVAL_MS[interval];
    const rawStart = Math.floor(twoYearsAgo + Math.random() * (latestStart - twoYearsAgo));

    // Snap start timestamp to higher timeframe boundary
    const snappedStart = snapToInterval(rawStart, config.higher);

    const WARMUP_COUNT = 250;
    const TOTAL_MAIN_COUNT = WARMUP_COUNT + 300;
    const warmupOffsetMs = WARMUP_COUNT * INTERVAL_MS[interval];
    const fetchStartTime = snappedStart - warmupOffsetMs;

    // Fetch primary and secondary timeframe charts with warmup prefix
    const [mainCandlesRaw, lowerCandlesRaw, higherCandlesRaw] = await Promise.all([
      fetchCandles(symbol, interval, fetchStartTime, TOTAL_MAIN_COUNT),
      fetchCandles(symbol, config.lower, fetchStartTime, TOTAL_MAIN_COUNT * config.lowerMultiplier),
      fetchCandles(
        symbol,
        config.higher,
        fetchStartTime,
        Math.ceil(TOTAL_MAIN_COUNT / config.higherMultiplier)
      ),
    ]);

    if (mainCandlesRaw.length < 100) {
      return res.status(500).json({ error: "Failed to fetch enough historical data" });
    }

    // Split main candles into warmup prefix and visible candles
    const actualWarmupCount = Math.min(WARMUP_COUNT, Math.max(0, mainCandlesRaw.length - 100));
    const warmupMain = mainCandlesRaw.slice(0, actualWarmupCount);
    const visibleMain = mainCandlesRaw.slice(actualWarmupCount);

    const lowerWarmupCount = actualWarmupCount * config.lowerMultiplier;
    const warmupLower = lowerCandlesRaw.slice(0, lowerWarmupCount);
    const visibleLower = lowerCandlesRaw.slice(lowerWarmupCount);

    const higherWarmupCount = Math.floor(actualWarmupCount / config.higherMultiplier);
    const warmupHigher = higherCandlesRaw.slice(0, higherWarmupCount);
    const visibleHigher = higherCandlesRaw.slice(higherWarmupCount);

    // Calculate volume normalization divisor and price multiplier
    const volumeDivisor = calculateVolumeDivisor(visibleMain);
    const maxHigh = Math.max(...visibleMain.map((c) => c.high));
    const randomFactor = Math.random() * 99 + 1;
    const multiplier = (100 / maxHigh) * randomFactor;

    // Obfuscate series
    const obfuscatedWarmupMain = obfuscateSeries(warmupMain, multiplier, volumeDivisor);
    const obfuscatedMain = obfuscateSeries(visibleMain, multiplier, volumeDivisor);

    const obfuscatedWarmupLower = obfuscateSeries(warmupLower, multiplier, volumeDivisor);
    const obfuscatedLower = obfuscateSeries(visibleLower, multiplier, volumeDivisor);

    const obfuscatedWarmupHigher = obfuscateSeries(warmupHigher, multiplier, volumeDivisor);
    const obfuscatedHigher = obfuscateSeries(visibleHigher, multiplier, volumeDivisor);

    const startingCapital = 100000;

    const session = new GymSession({
      userId,
      schemaVersion: 2,
      mode: mode === "METHOD" ? "METHOD" : "FREE",
      actualSymbol: symbol,
      actualStartTimestamp: snappedStart,
      interval,
      priceMultiplier: multiplier,
      volumeDivisor,

      startingCapital,
      capital: startingCapital,
      riskPercent: 1,
      totalPnlCash: 0,
      totalR: 0,

      warmupCandles: obfuscatedWarmupMain,
      candles: obfuscatedMain,

      warmupLowerCandles: obfuscatedWarmupLower,
      lowerCandles: obfuscatedLower,
      lowerInterval: config.lower,

      warmupHigherCandles: obfuscatedWarmupHigher,
      higherCandles: obfuscatedHigher,
      higherInterval: config.higher,

      currentCandleIndex: 50,
      initialCandleCount: 50,
      trades: [],
      totalPnl: 0,
      status: "ACTIVE",
    });

    await saveSession(session);

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  })
);

// GET /api/gym/session/:id - Get session state
router.get(
  "/session/:id",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    return res.json({
      success: true,
      session: formatSessionResponse(req.gymSession!),
    });
  })
);

// POST /api/gym/session/:id/wait - Advance time (reveal more candles) and check fills
router.post(
  "/session/:id/wait",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    const { candlesToAdvance = 1 } = req.body;
    const parsedStep = parseInt(String(candlesToAdvance), 10);
    if (isNaN(parsedStep) || parsedStep <= 0) {
      return res.status(400).json({ error: "candlesToAdvance must be a positive integer" });
    }

    advance(session, parsedStep);
    await saveSession(session);

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  })
);

// POST /api/gym/session/:id/thesis/preview - Dry-run preview thesis validation & sizing
router.post(
  "/session/:id/thesis/preview",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    if (session.currentCandleIndex <= 0) {
      return res.status(400).json({ error: "No candles revealed yet" });
    }

    const currentCandle = session.candles[session.currentCandleIndex - 1];
    const validation = validateThesis(req.body, session, currentCandle.close, currentAtr(session));

    return res.json({
      success: true,
      validation,
    });
  })
);

// POST /api/gym/session/:id/trade - Open a new trade (MARKET or LIMIT)
router.post(
  "/session/:id/trade",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    // Evaluate Risk Governor
    const governorRes = evaluateGovernor(session);
    if (session.mode === "METHOD" && governorRes.isHalted) {
      // Record breach attempt
      if (!session.governor) {
        session.governor = {
          riskTier: governorRes.riskTier,
          consecutiveLosses: 0,
          peakBufferPct: 0,
          isHalted: true,
          haltReason: governorRes.haltReason,
          breachAttempts: [],
        };
      }
      if (!session.governor.breachAttempts) {
        session.governor.breachAttempts = [];
      }
      session.governor.breachAttempts.push({
        candleIndex: session.currentCandleIndex - 1,
        ruleId: governorRes.ruleId || "GOVERNOR_HALTED",
        reason: governorRes.haltReason || "Trade rejected by risk governor",
        timestamp: new Date(),
      });
      await saveSession(session);

      return res.status(403).json({
        error: governorRes.haltReason || "Session is halted by risk governor",
        code: "GOVERNOR_HALT",
        ruleId: governorRes.ruleId,
      });
    }

    const { side, stopLoss, takeProfit, type = "MARKET", limitPrice, thesis } = req.body;

    if (!side || !["LONG", "SHORT"].includes(side)) {
      return res.status(400).json({ error: "side must be 'LONG' or 'SHORT'" });
    }
    if (typeof stopLoss !== "number" || typeof takeProfit !== "number") {
      return res.status(400).json({ error: "stopLoss and takeProfit are required" });
    }
    if (type === "LIMIT" && typeof limitPrice !== "number") {
      return res.status(400).json({ error: "limitPrice is required for LIMIT orders" });
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

    // Thesis validation for METHOD mode
    let calculatedQuantity: number | undefined;
    let riskAmount: number | undefined;
    let riskPerUnit: number | undefined;

    if (session.mode === "METHOD") {
      if (!thesis) {
        return res.status(400).json({
          error: "A declared trade thesis is required in METHOD mode",
          code: "THESIS_REQUIRED",
        });
      }

      const validationInput = {
        setupType: thesis.setupType,
        side,
        triggerPrice: entryPrice,
        invalidationPrice: thesis.invalidationPrice ?? stopLoss,
        plannedStop: stopLoss,
        targetPrice: takeProfit,
        classification: thesis.classification,
        plannedRiskPercent: thesis.plannedRiskPercent,
      };

      const validation = validateThesis(validationInput, session, entryPrice, currentAtr(session));
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.reason || "Thesis validation failed",
          autoChecks: validation.autoChecks,
          code: "THESIS_INVALID",
        });
      }

      calculatedQuantity = validation.calculatedQuantity;
      riskAmount = validation.riskAmount;
      riskPerUnit = validation.riskPerUnit;
    } else {
      // Basic SL/TP check for FREE mode
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
    }

    const tradeIndex = session.trades.length;
    const newTrade: IGymTrade = {
      tradeIndex,
      entryCandle: session.currentCandleIndex - 1,
      exitCandle: null,
      side,
      entryPrice,
      exitPrice: null,
      stopLoss,
      takeProfit,
      quantity: calculatedQuantity,
      riskAmount,
      riskPerUnit,
      initialStopLoss: stopLoss,
      pnl: null,
      status: type === "LIMIT" ? "PENDING" : "OPEN",
      type,
      invalidationPrice: thesis?.invalidationPrice ?? stopLoss,
      ...(thesis && { thesis }),
    };

    session.trades.push(newTrade);
    await saveSession(session);

    return res.json({
      success: true,
      trade: newTrade,
      session: formatSessionResponse(session),
    });
  })
);

// POST /api/gym/session/:id/trade/cancel - Cancel a pending limit trade
router.post(
  "/session/:id/trade/cancel",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    const pendingTrade = session.trades.find((t) => t.status === "PENDING");
    if (!pendingTrade) {
      return res.status(400).json({ error: "No pending trade to cancel" });
    }

    pendingTrade.status = "CANCELED";
    await saveSession(session);

    return res.json({
      success: true,
      trade: pendingTrade,
      session: formatSessionResponse(session),
    });
  })
);

// POST /api/gym/session/:id/close - Close open trade at current price
router.post(
  "/session/:id/close",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    const openTrade = session.trades.find((t) => t.status === "OPEN");
    if (!openTrade) {
      return res.status(400).json({ error: "No open trade to close" });
    }

    if (session.currentCandleIndex <= 0) {
      return res.status(400).json({ error: "No candles revealed yet" });
    }

    const currentCandle = session.candles[session.currentCandleIndex - 1];
    closeTrade(openTrade, currentCandle.close, session.currentCandleIndex - 1);

    await saveSession(session);

    return res.json({
      success: true,
      trade: openTrade,
      session: formatSessionResponse(session),
    });
  })
);

// POST /api/gym/session/:id/modify-stop - Modify stop loss of active or pending trade
router.post(
  "/session/:id/modify-stop",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    const { tradeIndex, newStop } = req.body;
    if (typeof tradeIndex !== "number" || typeof newStop !== "number") {
      return res.status(400).json({ error: "tradeIndex and newStop numbers are required" });
    }

    const trade = session.trades[tradeIndex];
    if (!trade) {
      return res.status(404).json({ error: "Trade not found" });
    }
    if (trade.status !== "OPEN" && trade.status !== "PENDING") {
      return res.status(400).json({ error: "Only open or pending trades can have stop loss modified" });
    }

    // Validate new stop direction
    if (trade.side === "LONG" && newStop >= trade.entryPrice) {
      return res.status(400).json({ error: "For LONG, stop loss must be below entry price" });
    }
    if (trade.side === "SHORT" && newStop <= trade.entryPrice) {
      return res.status(400).json({ error: "For SHORT, stop loss must be above entry price" });
    }

    trade.initialStopLoss ??= getInitialStop(trade);
    const oldStop = trade.stopLoss;
    const isWidened =
      trade.side === "LONG" ? newStop < oldStop : newStop > oldStop;

    if (!trade.stopHistory) {
      trade.stopHistory = [];
    }

    trade.stopHistory.push({
      atCandle: session.currentCandleIndex - 1,
      from: oldStop,
      to: newStop,
      widened: isWidened,
    });

    trade.stopLoss = newStop;
    if (trade.quantity) {
      trade.riskPerUnit = Math.abs(trade.entryPrice - newStop);
      trade.riskAmount = +(trade.quantity * trade.riskPerUnit).toFixed(2);
    }

    await saveSession(session);

    return res.json({
      success: true,
      trade,
      session: formatSessionResponse(session),
    });
  })
);
router.post(
  "/session/:id/abandon",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Session is not active" });
    }

    // Cancel pending trades
    for (const trade of session.trades) {
      if (trade.status === "PENDING" || trade.status === "OPEN") {
        trade.status = "CANCELED";
      }
    }

    session.status = "ABANDONED";
    session.endedAt = new Date();
    await saveSession(session);

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  })
);

// POST /api/gym/session/:id/reveal - Reveal actual symbol and date
router.post(
  "/session/:id/reveal",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;

    if (session.status === "REVEALED") {
      return res.json({ success: true, session: formatSessionResponse(session) });
    }

    // Close all open trades at current price before reveal
    const openTrades = session.trades.filter((t) => t.status === "OPEN");
    if (openTrades.length > 0 && session.currentCandleIndex > 0) {
      const currentCandle = session.candles[session.currentCandleIndex - 1];
      for (const openTrade of openTrades) {
        closeTrade(openTrade, currentCandle.close, session.currentCandleIndex - 1);
      }
    }

    // Cancel all pending trades
    for (const trade of session.trades) {
      if (trade.status === "PENDING") {
        trade.status = "CANCELED";
      }
    }

    session.status = "REVEALED";
    session.endedAt = new Date();
    session.currentCandleIndex = session.candles.length; // Show all candles
    await saveSession(session);

    return res.json({
      success: true,
      session: formatSessionResponse(session),
    });
  })
);

// GET /api/gym/sessions - Get user's session history
router.get(
  "/sessions",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = 10 } = req.query;
    const userId = req.user!.id;

    const sessions = await GymSession.find({ userId })
      .select("_id interval status totalPnl totalPnlCash totalR createdAt actualSymbol mode schemaVersion")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s._id,
        schemaVersion: s.schemaVersion ?? 1,
        mode: s.mode ?? "FREE",
        interval: s.interval,
        status: s.status,
        totalPnl: s.totalPnl,
        totalPnlCash: s.totalPnlCash ?? 0,
        totalR: s.totalR ?? 0,
        createdAt: s.createdAt,
        ...(s.status === "REVEALED" && { actualSymbol: s.actualSymbol }),
      })),
    });
  })
);

// ── DRILL ENDPOINTS ───────────────────────────────────────

// POST /api/gym/drills/start - Generate a new perceptual drill session
router.post(
  "/drills/start",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { drillType = "PIVOT" } = req.body;

    const symbol = SUPPORTED_SYMBOLS[Math.floor(Math.random() * SUPPORTED_SYMBOLS.length)];
    const interval = "15m";
    const config = TIMEFRAME_CONFIGS[interval];

    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    const latestStart = Date.now() - 300 * INTERVAL_MS[interval];
    const startTime = snapToInterval(
      Math.floor(twoYearsAgo + Math.random() * (latestStart - twoYearsAgo)),
      config.higher
    );

    const [mainCandlesRaw, lowerCandlesRaw, higherCandlesRaw] = await Promise.all([
      fetchCandles(symbol, interval, startTime, 100),
      fetchCandles(symbol, config.lower, startTime, 300),
      fetchCandles(symbol, config.higher, startTime, 25),
    ]);

    if (mainCandlesRaw.length < 50) {
      return res.status(500).json({ error: "Failed to fetch data for drill" });
    }

    const volumeDivisor = calculateVolumeDivisor(mainCandlesRaw);
    const maxHigh = Math.max(...mainCandlesRaw.map((c) => c.high));
    const multiplier = (100 / maxHigh) * (Math.random() * 99 + 1);

    const obfuscatedMain = obfuscateSeries(mainCandlesRaw, multiplier, volumeDivisor);
    const obfuscatedLower = obfuscateSeries(lowerCandlesRaw, multiplier, volumeDivisor);
    const obfuscatedHigher = obfuscateSeries(higherCandlesRaw, multiplier, volumeDivisor);

    let answerKey: any;
    if (drillType === "PIVOT") {
      answerKey = findPivots(obfuscatedMain);
    } else if (drillType === "MOMENTUM") {
      answerKey = evaluateMomentum(obfuscatedMain, obfuscatedHigher);
    } else if (drillType === "ALIGNMENT") {
      answerKey = evaluateAlignment(obfuscatedHigher, obfuscatedMain, obfuscatedLower);
    } else {
      answerKey = { type: "IMPULSE_CORRECTIVE", unscored: true };
    }

    const drill = new GymDrill({
      userId,
      drillType,
      symbol,
      interval,
      candles: obfuscatedMain,
      lowerCandles: obfuscatedLower,
      higherCandles: obfuscatedHigher,
      answerKey,
      status: "ACTIVE",
    });

    await drill.save();

    return res.json({
      success: true,
      drill: {
        id: drill._id,
        drillType: drill.drillType,
        candles: drill.candles,
        lowerCandles: drill.lowerCandles,
        higherCandles: drill.higherCandles,
        status: drill.status,
      },
    });
  })
);

// POST /api/gym/drills/:id/submit - Submit user answer and receive score & metrics
router.post(
  "/drills/:id/submit",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const drill = await GymDrill.findById(req.params.id);

    if (!drill) {
      return res.status(404).json({ error: "Drill not found" });
    }
    if (drill.userId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (drill.status !== "ACTIVE") {
      return res.status(400).json({ error: "Drill already submitted" });
    }

    const { submission } = req.body;
    let score: number | null = null;
    let metrics: any = null;

    if (drill.drillType === "PIVOT") {
      const userMarks = Array.isArray(submission?.marks) ? submission.marks : [];
      const grade = gradePivotDrill(drill.answerKey, userMarks, 1);
      score = grade.f1Score;
      metrics = grade;
    } else if (drill.drillType === "MOMENTUM") {
      const ansZone = drill.answerKey.rsiZone;
      const userZone = submission?.rsiZone;
      const isCorrect = ansZone === userZone;
      score = isCorrect ? 100 : 0;
      metrics = { isCorrect, expected: ansZone, submitted: userZone };
    } else if (drill.drillType === "ALIGNMENT") {
      const ansCode = drill.answerKey.code;
      const userCode = submission?.code;
      const isCorrect = ansCode === userCode;
      score = isCorrect ? 100 : 0;
      metrics = { isCorrect, expected: ansCode, submitted: userCode };
    } else {
      // IMPULSE_CORRECTIVE - unscored self-check
      score = null;
      metrics = { unscored: true, userSubmission: submission };
    }

    drill.userSubmission = submission;
    drill.score = score;
    drill.metrics = metrics;
    drill.status = "SUBMITTED";
    drill.submittedAt = new Date();
    await drill.save();

    return res.json({
      success: true,
      drill: {
        id: drill._id,
        drillType: drill.drillType,
        score: drill.score,
        metrics: drill.metrics,
        answerKey: drill.answerKey,
        userSubmission: drill.userSubmission,
        status: drill.status,
      },
    });
  })
);

// GET /api/gym/drills/history - Fetch user drill history
router.get(
  "/drills/history",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { limit = 20 } = req.query;

    const drills = await GymDrill.find({ userId })
      .select("_id drillType score metrics status createdAt submittedAt")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      drills: drills.map((d) => ({
        id: d._id,
        drillType: d.drillType,
        score: d.score,
        metrics: d.metrics,
        status: d.status,
        createdAt: d.createdAt,
        submittedAt: d.submittedAt,
      })),
    });
  })
);

// GET /api/gym/session/:id/scorecard - Get frozen or evaluated session scorecard
router.get(
  "/session/:id/scorecard",
  loadOwnedSession,
  asyncHandler(async (req: GymRequest, res: Response) => {
    const session = req.gymSession!;

    if (session.schemaVersion < 2 || session.mode !== "METHOD") {
      return res.status(409).json({
        error: "Scorecard is only available for METHOD mode sessions (schemaVersion >= 2)",
        code: "LEGACY_SESSION",
      });
    }

    // An active-session read is a live preview and must never freeze a score.
    if (session.status === "ACTIVE") {
      return res.json({ success: true, scorecard: generateProcessScorecard(session) });
    }

    // Mongoose nested objects may be truthy even when no score was saved.
    if (!session.scorecard?.evaluatedAt ||
        (session.endedAt && session.scorecard.evaluatedAt < session.endedAt)) {
      await saveSession(session);
    }

    return res.json({ success: true, scorecard: session.scorecard });
  })
);

// GET /api/gym/stats - Get user's aggregated gym methodology statistics
router.get(
  "/stats",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const sessions = await GymSession.find({ userId, mode: "METHOD" })
      .select("trades totalPnl totalPnlCash totalR scorecard status createdAt startingCapital")
      .lean();

    const totalSessions = sessions.length;
    let completedSessions = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let totalRPnL = 0;
    let totalPctPnL = 0;

    const correlationPoints: Array<{ processScore: number; pnlPct: number }> = [];

    for (const s of sessions) {
      if (s.status === "REVEALED" || s.status === "COMPLETED") {
        completedSessions++;
      }

      totalRPnL += s.totalR || 0;
      const capital = s.startingCapital || 100000;
      const pctPnl = ((s.totalPnlCash || 0) / capital) * 100;
      totalPctPnL += pctPnl;

      if (s.scorecard?.processScore != null) {
        correlationPoints.push({
          processScore: s.scorecard.processScore,
          pnlPct: pctPnl,
        });
      }

      for (const t of s.trades) {
        if (t.status === "CLOSED" || t.status === "STOPPED_OUT" || t.status === "TARGET_HIT") {
          totalTrades++;
          if ((t.pnl != null && t.pnl > 0) || (t.rMultiple != null && t.rMultiple > 0)) {
            winningTrades++;
          }
        }
      }
    }

    const winRate = totalTrades > 0 ? +((winningTrades / totalTrades) * 100).toFixed(1) : 0;
    const meanExpectancyR = totalTrades > 0 ? +(totalRPnL / totalTrades).toFixed(2) : 0;
    const meanProcessScore =
      correlationPoints.length > 0
        ? +(correlationPoints.reduce((sum, p) => sum + p.processScore, 0) / correlationPoints.length).toFixed(1)
        : null;

    const correlation = calculatePearsonCorrelation(correlationPoints);

    return res.json({
      success: true,
      stats: {
        totalSessions,
        completedSessions,
        totalTrades,
        winRate,
        totalRPnL: +totalRPnL.toFixed(2),
        totalPctPnL: +totalPctPnL.toFixed(2),
        meanExpectancyR,
        meanProcessScore,
        correlation,
      },
    });
  })
);

// GET /api/gym/chart/process-vs-pnl - Get Process Score vs PnL scatter/line series
router.get(
  "/chart/process-vs-pnl",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const sessions = await GymSession.find({
      userId,
      mode: "METHOD",
      "scorecard.processScore": { $ne: null },
    })
      .select("_id scorecard totalPnlCash totalR createdAt startingCapital")
      .sort({ createdAt: 1 })
      .lean();

    const points = sessions.map((s) => {
      const capital = s.startingCapital || 100000;
      const pnlPct = +(((s.totalPnlCash || 0) / capital) * 100).toFixed(2);
      return {
        sessionId: s._id,
        processScore: s.scorecard!.processScore!,
        pnlPct,
        totalR: s.totalR || 0,
        createdAt: s.createdAt,
      };
    });

    const correlation = calculatePearsonCorrelation(points);

    return res.json({
      success: true,
      data: points,
      correlation,
    });
  })
);

// GET /api/gym/chart/equity - Get cumulative % capital equity curve
router.get(
  "/chart/equity",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const sessions = await GymSession.find({ userId })
      .select("totalPnlCash createdAt startingCapital")
      .sort({ createdAt: 1 })
      .lean();

    let cumulativePct = 0;
    const series = sessions.map((s) => {
      const capital = s.startingCapital || 100000;
      const pct = ((s.totalPnlCash || 0) / capital) * 100;
      cumulativePct += pct;

      return {
        time: new Date(s.createdAt).toISOString().split("T")[0],
        value: +cumulativePct.toFixed(2),
      };
    });

    return res.json({
      success: true,
      series,
    });
  })
);

export default router;
