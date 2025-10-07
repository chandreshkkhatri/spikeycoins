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
    const { watchlistId } = req.query;

    if (!watchlistId) {
      return res.status(400).json({ error: "watchlistId is required" });
    }

    await connectDB();
    const watchlist = await Watchlist.findById(watchlistId);

    if (!watchlist) {
      return res.status(404).json({ error: "Watchlist not found" });
    }

    return res.json({
      success: true,
      symbols: watchlist.symbols,
    });
  } catch (error) {
    console.error("Error fetching watchlist symbols:", error);
    return res.status(500).json({ error: "Failed to fetch symbols" });
  }
});

export default router;
