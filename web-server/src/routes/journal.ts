import { Router, Response } from "express";
import { BinanceService } from "../lib/binance-service";
import JournalTrade from "../models/journal-trade";
import JournalSync from "../models/journal-sync";
import { syncAccount, SyncProgressEvent } from "../lib/journal-sync-service";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { BrokerFactory } from "../lib/broker-factory";
import { demoAccountService } from "../lib/demo-account-service";
import { asyncHandler } from "../lib/async-handler";

const router: Router = Router();

// All journal routes require authentication and account access check
router.use(requireAuth);
router.use(requireAccountAccess);



// ── POST /api/journal/sync ─────────────────────────────
router.post(
  "/sync",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const userId = demoAccountService.isDemoAccountId(account._id as string) ? "system" : req.user!.id;

    if (account.accountType !== "binance") {
      return res.status(400).json({ error: "Only Binance accounts are supported" });
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Journal sync is only available for Binance Futures accounts",
      });
    }

    const service = BrokerFactory.getBinanceClient(account);

    // Fire-and-forget sync
    syncAccount(account._id!, userId, service).catch((err) => {
      console.error("Journal background sync error:", err);
    });

    return res.status(202).json({ success: true, message: "Sync started" });
  })
);

// ── GET /api/journal/sync/stream (SSE) ─────────────────
router.get(
  "/sync/stream",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const userId = demoAccountService.isDemoAccountId(account._id as string) ? "system" : req.user!.id;

    if (account.accountType !== "binance") {
      res.status(400).json({ error: "Only Binance accounts are supported" });
      return;
    }

    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      res.status(400).json({
        error: "Journal sync is only available for Binance Futures accounts",
      });
      return;
    }

    const service = BrokerFactory.getBinanceClient(account);

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: SyncProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await syncAccount(account._id!, userId, service, send);
    } catch {
      // error event already sent by syncAccount
    }

    res.end();
  })
);

// ── GET /api/journal/sync/status ───────────────────────
router.get(
  "/sync/status",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;

    const syncState = await JournalSync.findOne({
      accountId: account._id,
    }).lean();

    if (!syncState) {
      return res.json({
        success: true,
        sync: {
          lastSyncTime: 0,
          syncStatus: "idle",
          initialSyncCompleted: false,
          totalFillsSynced: 0,
          lastError: null,
        },
      });
    }

    return res.json({
      success: true,
      sync: {
        lastSyncTime: syncState.lastSyncTime,
        syncStatus: syncState.syncStatus,
        initialSyncCompleted: syncState.initialSyncCompleted,
        totalFillsSynced: syncState.totalFillsSynced,
        lastError: syncState.lastError,
        symbolsSynced: syncState.symbolsSynced,
      },
    });
  })
);

// ── GET /api/journal/trades ────────────────────────────
router.get(
  "/trades",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const {
      status,
      symbol,
      direction,
      startDate,
      endDate,
      page,
      pageSize,
      sortBy,
      sortOrder,
    } = req.query;

    const query: any = { accountId: account._id };

    if (status) query.status = status;
    if (symbol) query.symbol = (symbol as string).toUpperCase();
    if (direction) query.direction = direction;

    if (startDate || endDate) {
      query.entryTime = {};
      if (startDate) query.entryTime.$gte = new Date(startDate as string);
      if (endDate) query.entryTime.$lte = new Date(endDate as string);
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSizeNum = Math.min(
      100,
      Math.max(1, parseInt(pageSize as string, 10) || 20),
    );
    const skip = (pageNum - 1) * pageSizeNum;

    const sortField = (sortBy as string) || "entryTime";
    const sortDir = (sortOrder as string) === "asc" ? 1 : -1;

    const [trades, total] = await Promise.all([
      JournalTrade.find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(pageSizeNum)
        .lean(),
      JournalTrade.countDocuments(query),
    ]);

    return res.json({
      success: true,
      trades,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        hasMore: skip + pageSizeNum < total,
      },
    });
  })
);

// ── GET /api/journal/stats ─────────────────────────────
router.get(
  "/stats",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const { period, startDate, endDate } = req.query;

    const match: any = {
      accountId: account._id,
      status: "CLOSED",
    };

    if (startDate || endDate) {
      match.exitTime = {};
      if (startDate) match.exitTime.$gte = new Date(startDate as string);
      if (endDate) match.exitTime.$lte = new Date(endDate as string);
    } else if (period) {
      const now = Date.now();
      let ms = 0;
      switch (period) {
        case "7d": ms = 7 * 24 * 60 * 60 * 1000; break;
        case "30d": ms = 30 * 24 * 60 * 60 * 1000; break;
        case "90d": ms = 90 * 24 * 60 * 60 * 1000; break;
        default: ms = 0;
      }
      if (ms > 0) {
        match.exitTime = { $gte: new Date(now - ms) };
      }
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          winCount: {
            $sum: { $cond: [{ $gt: ["$netPnl", 0] }, 1, 0] },
          },
          lossCount: {
            $sum: { $cond: [{ $lt: ["$netPnl", 0] }, 1, 0] },
          },
          breakEvenCount: {
            $sum: { $cond: [{ $eq: ["$netPnl", 0] }, 1, 0] },
          },
          totalNetPnl: { $sum: "$netPnl" },
          grossProfit: {
            $sum: {
              $cond: [{ $gt: ["$netPnl", 0] }, "$netPnl", 0],
            },
          },
          grossLoss: {
            $sum: {
              $cond: [{ $lt: ["$netPnl", 0] }, "$netPnl", 0],
            },
          },
          largestWin: { $max: "$netPnl" },
          largestLoss: { $min: "$netPnl" },
          totalCommission: { $sum: "$commission" },
          avgDuration: { $avg: "$duration" },
        },
      },
    ];

    const results = await JournalTrade.aggregate(pipeline);
    const data = results[0];

    if (!data) {
      return res.json({
        success: true,
        stats: {
          totalTrades: 0,
          winCount: 0,
          lossCount: 0,
          breakEvenCount: 0,
          winRate: 0,
          totalNetPnl: 0,
          grossProfit: 0,
          grossLoss: 0,
          profitFactor: 0,
          avgWin: 0,
          avgLoss: 0,
          largestWin: 0,
          largestLoss: 0,
          avgDuration: 0,
          totalCommission: 0,
          expectancy: 0,
        },
      });
    }

    const winRate =
      data.totalTrades > 0 ? data.winCount / data.totalTrades : 0;
    const avgWin =
      data.winCount > 0 ? data.grossProfit / data.winCount : 0;
    const avgLoss =
      data.lossCount > 0 ? data.grossLoss / data.lossCount : 0;
    const profitFactor =
      data.grossLoss !== 0
        ? Math.abs(data.grossProfit / data.grossLoss)
        : data.grossProfit > 0
          ? Infinity
          : 0;
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

    return res.json({
      success: true,
      stats: {
        totalTrades: data.totalTrades,
        winCount: data.winCount,
        lossCount: data.lossCount,
        breakEvenCount: data.breakEvenCount,
        winRate,
        totalNetPnl: data.totalNetPnl,
        grossProfit: data.grossProfit,
        grossLoss: data.grossLoss,
        profitFactor,
        avgWin,
        avgLoss,
        largestWin: data.largestWin,
        largestLoss: data.largestLoss,
        avgDuration: data.avgDuration || 0,
        totalCommission: data.totalCommission,
        expectancy,
      },
    });
  })
);

// ── GET /api/journal/chart/equity ──────────────────────
router.get(
  "/chart/equity",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const { period, startDate, endDate } = req.query;

    const match: any = {
      accountId: account._id,
      status: "CLOSED",
      exitTime: { $ne: null },
    };

    if (startDate || endDate) {
      if (startDate)
        match.exitTime.$gte = new Date(startDate as string);
      if (endDate) match.exitTime.$lte = new Date(endDate as string);
    } else if (period) {
      const now = Date.now();
      let ms = 0;
      switch (period) {
        case "7d": ms = 7 * 24 * 60 * 60 * 1000; break;
        case "30d": ms = 30 * 24 * 60 * 60 * 1000; break;
        case "90d": ms = 90 * 24 * 60 * 60 * 1000; break;
        default: ms = 0;
      }
      if (ms > 0) {
        match.exitTime.$gte = new Date(now - ms);
      }
    }

    const trades = await JournalTrade.find(match)
      .sort({ exitTime: 1 })
      .select("exitTime netPnl")
      .lean();

    let cumPnl = 0;
    const data = trades.map((t) => {
      cumPnl += t.netPnl;
      return {
        time: Math.floor(new Date(t.exitTime!).getTime() / 1000),
        value: Math.round(cumPnl * 100) / 100,
      };
    });

    return res.json({ success: true, data });
  })
);

// ── GET /api/journal/chart/daily-pnl ───────────────────
router.get(
  "/chart/daily-pnl",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
    const { period, startDate, endDate } = req.query;

    const match: any = {
      accountId: account._id,
      status: "CLOSED",
      exitTime: { $ne: null },
    };

    if (startDate || endDate) {
      if (startDate)
        match.exitTime.$gte = new Date(startDate as string);
      if (endDate) match.exitTime.$lte = new Date(endDate as string);
    } else if (period) {
      const now = Date.now();
      let ms = 0;
      switch (period) {
        case "7d": ms = 7 * 24 * 60 * 60 * 1000; break;
        case "30d": ms = 30 * 24 * 60 * 60 * 1000; break;
        case "90d": ms = 90 * 24 * 60 * 60 * 1000; break;
        default: ms = 0;
      }
      if (ms > 0) {
        match.exitTime.$gte = new Date(now - ms);
      }
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$exitTime" },
          },
          dailyPnl: { $sum: "$netPnl" },
          tradeCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as const } },
    ];

    const results = await JournalTrade.aggregate(pipeline);

    const data = results.map((r: any) => {
      const dateMs = new Date(r._id + "T00:00:00Z").getTime();
      return {
        time: Math.floor(dateMs / 1000),
        value: Math.round(r.dailyPnl * 100) / 100,
        color: r.dailyPnl >= 0 ? "#22c55e" : "#ef4444",
      };
    });

    return res.json({ success: true, data });
  })
);

export default router;
