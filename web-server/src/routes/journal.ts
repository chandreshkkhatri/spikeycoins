import { Router, Request, Response } from "express";
import { BinanceService } from "../lib/binance-service";
import { getAccountById } from "../models/account";
import { demoAccountService } from "../lib/demo-account-service";
import JournalTrade from "../models/journal-trade";
import JournalSync from "../models/journal-sync";
import { syncAccount } from "../lib/journal-sync-service";

const router: Router = Router();

/**
 * Resolve account from accountId, handling demo account pattern.
 */
async function resolveAccount(accountId: string) {
  if (demoAccountService.isDemoAccountId(accountId)) {
    const account = demoAccountService.getDemoAccount(true);
    if (!account) throw new Error("Demo account not configured");
    return { account, userId: "system" };
  }
  const account = await getAccountById(accountId);
  if (!account) throw new Error("Account not found");
  return { account, userId: account.userId };
}

function initBinanceService(account: any): BinanceService {
  const service = new BinanceService();
  service.initializeWithCredentials(
    account.apiKey,
    account.apiSecret,
    account.metadata?.testnet ?? false,
  );
  return service;
}

// ── POST /api/journal/sync ─────────────────────────────

router.post("/sync", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const { account, userId } = await resolveAccount(accountId);
    if (account.accountType !== "binance") {
      return res.status(400).json({ error: "Only Binance accounts are supported" });
    }
    const tradingSegment = account.metadata?.tradingSegment || "spot";
    if (tradingSegment !== "usdm") {
      return res.status(400).json({
        error: "Journal sync is only available for Binance Futures accounts",
      });
    }

    const service = initBinanceService(account);

    // Fire-and-forget — respond immediately, sync runs in background
    syncAccount(accountId, userId, service).catch((err) => {
      console.error("Journal background sync error:", err);
    });

    return res.status(202).json({ success: true, message: "Sync started" });
  } catch (error: any) {
    if (error.message === "Sync already in progress for this account") {
      return res.status(409).json({ error: error.message });
    }
    console.error("Journal sync error:", error);
    return res.status(500).json({
      error: "Failed to sync journal",
      details: error.message,
    });
  }
});

// ── GET /api/journal/sync/status ───────────────────────

router.get("/sync/status", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const syncState = await JournalSync.findOne({
      accountId: accountId as string,
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
  } catch (error: any) {
    console.error("Error fetching sync status:", error);
    return res.status(500).json({
      error: "Failed to fetch sync status",
      details: error.message,
    });
  }
});

// ── GET /api/journal/trades ────────────────────────────

router.get("/trades", async (req: Request, res: Response) => {
  try {
    const {
      accountId,
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

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const query: any = { accountId: accountId as string };

    if (status) query.status = status;
    if (symbol) query.symbol = (symbol as string).toUpperCase();
    if (direction) query.direction = direction;

    // Date filtering on entryTime
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
  } catch (error: any) {
    console.error("Error fetching journal trades:", error);
    return res.status(500).json({
      error: "Failed to fetch trades",
      details: error.message,
    });
  }
});

// ── GET /api/journal/stats ─────────────────────────────

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { accountId, period, startDate, endDate } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const match: any = {
      accountId: accountId as string,
      status: "CLOSED",
    };

    // Apply time filter
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
  } catch (error: any) {
    console.error("Error fetching journal stats:", error);
    return res.status(500).json({
      error: "Failed to fetch stats",
      details: error.message,
    });
  }
});

// ── GET /api/journal/chart/equity ──────────────────────

router.get("/chart/equity", async (req: Request, res: Response) => {
  try {
    const { accountId, period, startDate, endDate } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const match: any = {
      accountId: accountId as string,
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
  } catch (error: any) {
    console.error("Error fetching equity chart:", error);
    return res.status(500).json({
      error: "Failed to fetch equity chart data",
      details: error.message,
    });
  }
});

// ── GET /api/journal/chart/daily-pnl ───────────────────

router.get("/chart/daily-pnl", async (req: Request, res: Response) => {
  try {
    const { accountId, period, startDate, endDate } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const match: any = {
      accountId: accountId as string,
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
      // Convert date string to unix timestamp (start of day UTC)
      const dateMs = new Date(r._id + "T00:00:00Z").getTime();
      return {
        time: Math.floor(dateMs / 1000),
        value: Math.round(r.dailyPnl * 100) / 100,
        color: r.dailyPnl >= 0 ? "#22c55e" : "#ef4444",
      };
    });

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching daily PnL chart:", error);
    return res.status(500).json({
      error: "Failed to fetch daily PnL chart data",
      details: error.message,
    });
  }
});

export default router;
