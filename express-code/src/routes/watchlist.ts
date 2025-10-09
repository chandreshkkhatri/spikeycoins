import { Router, Request, Response } from "express";
import Watchlist from "../models/watchlist";
import connectDB from "../lib/mongodb";

const router = Router();

// GET /api/watchlist - Get watchlists for a user
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, accountId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    await connectDB();

    const query: any = { userId };
    if (accountId) {
      query.accountId = accountId;
    }

    const watchlists = await Watchlist.find(query);

    return res.json({
      success: true,
      watchlists,
    });
  } catch (error) {
    console.error("Error fetching watchlists:", error);
    return res.status(500).json({ error: "Failed to fetch watchlists" });
  }
});

// POST /api/watchlist - Create a new watchlist
router.post("/", async (req: Request, res: Response) => {
  try {
    const { userId, accountId, name, marketType, symbols } = req.body;

    if (!userId || !accountId || !name || !marketType) {
      return res.status(400).json({
        error: "userId, accountId, name, and marketType are required",
      });
    }

    await connectDB();

    const watchlist = new Watchlist({
      userId,
      accountId,
      name,
      marketType,
      symbols: symbols || [],
      isDefault: false,
    });

    await watchlist.save();

    return res.status(201).json({
      success: true,
      watchlist,
    });
  } catch (error) {
    console.error("Error creating watchlist:", error);
    return res.status(500).json({ error: "Failed to create watchlist" });
  }
});

// GET /api/watchlist/symbols - Get symbols in a watchlist
router.get("/symbols", async (req: Request, res: Response) => {
  try {
    const { watchlistId, accountId, marketType } = req.query;

    await connectDB();

    let watchlist;

    if (watchlistId) {
      // Fetch by watchlist ID
      watchlist = await Watchlist.findById(watchlistId);
    } else if (accountId && marketType) {
      // Fetch default watchlist for account and market type
      watchlist = await Watchlist.findOne({
        accountId,
        marketType,
        isDefault: true,
      });

      // If no default watchlist exists, create one
      if (!watchlist) {
        watchlist = new Watchlist({
          userId: "default_user", // You may want to get this from session/auth
          accountId,
          name: `${marketType} Watchlist`,
          marketType,
          symbols: [],
          isDefault: true,
        });
        await watchlist.save();
      }
    } else {
      return res.status(400).json({
        error: "Either watchlistId or (accountId and marketType) is required",
      });
    }

    if (!watchlist) {
      return res.status(404).json({ error: "Watchlist not found" });
    }

    const items = (watchlist.symbols as any[]) || [];
    const symbolsOnly = items
      .map((s: any) => (typeof s === "string" ? s : s?.symbol))
      .filter((s: any) => !!s);

    return res.json({
      success: true,
      items,
      symbols: symbolsOnly,
      watchlistId: watchlist._id,
      watchlistName: watchlist.name,
    });
  } catch (error) {
    console.error("Error fetching watchlist symbols:", error);
    return res.status(500).json({ error: "Failed to fetch symbols" });
  }
});

// POST /api/watchlist/symbols - Add a symbol to a watchlist
router.post("/symbols", async (req: Request, res: Response) => {
  try {
    const { watchlistId, symbol, accountId, marketType, item } = req.body;

    await connectDB();

    let watchlist;

    if (watchlistId) {
      // Add to specific watchlist
      watchlist = await Watchlist.findById(watchlistId);
    } else if (accountId && marketType) {
      // Add to default watchlist for account and market type
      watchlist = await Watchlist.findOne({
        accountId,
        marketType,
        isDefault: true,
      });

      // If no default watchlist exists, create one
      if (!watchlist) {
        watchlist = new Watchlist({
          userId: "default_user",
          accountId,
          name: `${marketType} Watchlist`,
          marketType,
          symbols: [],
          isDefault: true,
        });
      }
    } else {
      return res.status(400).json({
        error: "Either watchlistId or (accountId and marketType) is required",
      });
    }

    if (!watchlist) {
      return res.status(404).json({ error: "Watchlist not found" });
    }

    // Build symbol object to store
    const symbolObj: any = item?.symbol
      ? item
      : typeof symbol === "string"
      ? { symbol }
      : null;

    if (!symbolObj || !symbolObj.symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    // Prevent duplicates
    const exists = (watchlist.symbols as any[]).some((s: any) => {
      if (typeof s === "string") return s === symbolObj.symbol;
      return s?.symbol === symbolObj.symbol;
    });

    if (!exists) {
      (watchlist.symbols as any[]).push(symbolObj);
      await watchlist.save();
    }

    const items = (watchlist.symbols as any[]) || [];
    const symbolsOnly = items
      .map((s: any) => (typeof s === "string" ? s : s?.symbol))
      .filter((s: any) => !!s);

    return res.json({
      success: true,
      watchlist,
      items,
      symbols: symbolsOnly,
    });
  } catch (error) {
    console.error("Error adding symbol to watchlist:", error);
    return res.status(500).json({ error: "Failed to add symbol" });
  }
});

// DELETE /api/watchlist/symbols - Remove a symbol from watchlist
router.delete("/symbols", async (req: Request, res: Response) => {
  try {
    const { watchlistId, symbol, accountId, marketType } = req.query;

    await connectDB();

    let watchlist;

    if (watchlistId) {
      watchlist = await Watchlist.findById(watchlistId);
    } else if (accountId && marketType) {
      watchlist = await Watchlist.findOne({
        accountId,
        marketType,
        isDefault: true,
      });
    } else {
      return res.status(400).json({
        error: "Either watchlistId or (accountId and marketType) is required",
      });
    }

    if (!watchlist) {
      return res.status(404).json({ error: "Watchlist not found" });
    }

    // Remove symbol from list (supports string or object storage)
    watchlist.symbols = (watchlist.symbols as any[]).filter((s: any) => {
      if (typeof s === "string") return s !== symbol;
      return s?.symbol !== symbol;
    });
    await watchlist.save();

    const items = (watchlist.symbols as any[]) || [];
    const symbolsOnly = items
      .map((s: any) => (typeof s === "string" ? s : s?.symbol))
      .filter((s: any) => !!s);

    return res.json({
      success: true,
      watchlist,
      items,
      symbols: symbolsOnly,
    });
  } catch (error) {
    console.error("Error removing symbol from watchlist:", error);
    return res.status(500).json({ error: "Failed to remove symbol" });
  }
});

export default router;
