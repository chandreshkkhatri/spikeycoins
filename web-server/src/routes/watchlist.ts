import { Router, Request, Response } from "express";
import Watchlist from "../models/watchlist";
import connectDB from "../lib/mongodb";
import { BinanceService } from "../lib/binance-service";
import { getInstrumentModel } from "../models/instrument";
import { optionalAuth, AuthenticatedRequest } from "../lib/auth-middleware";

const router: Router = Router();

// Helper to get userId - uses authenticated user or falls back to query param/body
// No more default_user fallback - authentication is required
function getUserId(req: AuthenticatedRequest, fromBody = false): string | null {
  if (req.user?.id) {
    return req.user.id;
  }
  if (fromBody) {
    return (req.body.userId as string) || null;
  }
  return (req.query.userId as string) || null;
}

// GET /api/watchlist - Get watchlists for a user
router.get(
  "/",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      const { accountId } = req.query;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
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
  },
);

// POST /api/watchlist - Create a new watchlist
router.post(
  "/",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = getUserId(req, true);
      const { accountId, name, marketType, symbols } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!accountId || !name || !marketType) {
        return res.status(400).json({
          error: "accountId, name, and marketType are required",
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
  },
);

// GET /api/watchlist/symbols - Get symbols in a watchlist
router.get(
  "/symbols",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      const { watchlistId, accountId, marketType, noCreate } = req.query;

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

        // If no default watchlist exists and noCreate is not set, create one (requires authentication)
        if (!watchlist && noCreate !== "true") {
          if (!userId) {
            return res
              .status(401)
              .json({ error: "Authentication required to create watchlist" });
          }
          watchlist = new Watchlist({
            userId,
            accountId,
            name: "My Watchlist",
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

      // If no watchlist found (and noCreate was set), return empty result
      if (!watchlist) {
        // Fetch any existing user watchlists for the dropdown
        const existingWatchlists = userId
          ? await Watchlist.find({
              userId,
              accountId,
            }).select("_id name isDefault")
          : [];

        return res.json({
          success: true,
          items: [],
          symbols: [],
          watchlistId: null,
          watchlistName: null,
          watchlists: existingWatchlists.map((w) => ({
            id: w._id,
            name: w.name,
            isDefault: w.isDefault,
          })),
        });
      }

      const items = (watchlist.symbols as any[]) || [];
      const symbolsOnly = items
        .map((s: any) => (typeof s === "string" ? s : s?.symbol))
        .filter((s: any) => !!s);

      // Also fetch all watchlists for this user/account to populate the dropdown
      const watchlists = await Watchlist.find({
        userId: watchlist.userId,
        accountId: watchlist.accountId,
      }).select("_id name isDefault");

      const formattedWatchlists = watchlists.map((w) => ({
        id: w._id,
        name: w.name,
        isDefault: w.isDefault,
      }));

      return res.json({
        success: true,
        items,
        symbols: symbolsOnly,
        watchlistId: watchlist._id,
        watchlistName: watchlist.name,
        watchlists: formattedWatchlists,
      });
    } catch (error) {
      console.error("Error fetching watchlist symbols:", error);
      return res.status(500).json({ error: "Failed to fetch symbols" });
    }
  },
);

// POST /api/watchlist/symbols - Add a symbol to a watchlist
router.post(
  "/symbols",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = getUserId(req, true);
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

        // If no default watchlist exists, create one (requires userId)
        if (!watchlist) {
          if (!userId) {
            return res
              .status(401)
              .json({ error: "Authentication required to create watchlist" });
          }
          watchlist = new Watchlist({
            userId,
            accountId,
            name: "My Watchlist",
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
  },
);

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

// DELETE /api/watchlist/:id - Delete a watchlist
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Watchlist ID is required" });
    }

    await connectDB();

    const watchlist = await Watchlist.findById(id);

    if (!watchlist) {
      return res.status(404).json({ error: "Watchlist not found" });
    }

    // Allow deleting default watchlist - it will be recreated if needed
    // if (watchlist.isDefault) {
    //   return res.status(403).json({ error: "Cannot delete default watchlist" });
    // }

    await Watchlist.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Watchlist deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting watchlist:", error);
    return res.status(500).json({ error: "Failed to delete watchlist" });
  }
});

// GET /api/watchlist/system/:type - Get system watchlist (e.g. all binance futures)
router.get("/system/:type", async (req: Request, res: Response) => {
  try {
    const { type } = req.params;

    if (type !== "binance-futures") {
      return res
        .status(400)
        .json({ error: "Unsupported system watchlist type" });
    }

    await connectDB();

    // Get the Binance instrument model
    const Instrument = getInstrumentModel("binance");

    // Check if we have instruments in DB
    const count = await Instrument.countDocuments({
      exchange: "BINANCE",
      instrument_type: "FUTURES",
    });

    console.log(`[System Watchlist] Current instrument count: ${count}`);

    // If no instruments or very few (likely test data), sync from Binance
    if (count < 10) {
      console.log(
        "[System Watchlist] Count < 10, initiating sync from Binance...",
      );
      try {
        // If we have some but few, clear them first to avoid duplicates/stale data
        if (count > 0) {
          console.log("[System Watchlist] Clearing existing instruments...");
          await Instrument.deleteMany({
            exchange: "BINANCE",
            instrument_type: "FUTURES",
          });
        }

        console.log(
          "[System Watchlist] Fetching exchange info from Binance...",
        );
        const binanceService = new BinanceService();
        const exchangeInfo = await binanceService.getFuturesExchangeInfo();
        console.log(
          `[System Watchlist] Fetched ${exchangeInfo?.symbols?.length} symbols from Binance`,
        );

        if (exchangeInfo && exchangeInfo.symbols) {
          const instruments = exchangeInfo.symbols
            .filter((s: { status: string }) => s.status === "TRADING")
            .map((s: any) => ({
              instrument_token: s.symbol, // Use symbol as token for Binance
              tradingsymbol: s.symbol,
              name: s.pair || s.symbol,
              exchange: "BINANCE",
              instrument_type: "FUTURES",
              segment: "FUTURES",
              tick_size: s.filters.find(
                (f: any) => f.filterType === "PRICE_FILTER",
              )?.tickSize,
              lot_size: s.filters.find((f: any) => f.filterType === "LOT_SIZE")
                ?.stepSize,
              last_price: 0, // Will be updated by websocket
            }));

          console.log(
            `[System Watchlist] Inserting ${instruments.length} trading instruments...`,
          );
          if (instruments.length > 0) {
            await Instrument.insertMany(instruments);
            console.log("[System Watchlist] Insert successful");
          }
        }
      } catch (err) {
        console.error("Failed to sync Binance instruments:", err);
        return res.status(500).json({ error: "Failed to sync instruments" });
      }
    }

    // Fetch all instruments
    const instruments = await Instrument.find({
      exchange: "BINANCE",
      instrument_type: "FUTURES",
    }).sort({ tradingsymbol: 1 });

    const items = instruments.map((i) => ({
      symbol: i.tradingsymbol,
      name: i.name,
      exchange: i.exchange,
      instrument_type: i.instrument_type,
    }));

    const symbols = items.map((i) => i.symbol);

    return res.json({
      success: true,
      items,
      symbols,
      watchlistId: "system-binance-futures",
      watchlistName: "Binance Futures",
    });
  } catch (error) {
    console.error("Error fetching system watchlist:", error);
    return res.status(500).json({ error: "Failed to fetch system watchlist" });
  }
});

export default router;
