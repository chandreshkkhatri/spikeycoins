import { Router, Response } from "express";
import Watchlist from "../models/watchlist";
import { BinanceService } from "../lib/binance-service";
import { getInstrumentModel } from "../models/instrument";
import { requireAuth, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";

const router: Router = Router();

// All watchlist routes require authentication
router.use(requireAuth);

// GET /api/watchlist - Get watchlists for a user
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { accountId } = req.query;

    const query: any = { userId };
    if (accountId) {
      query.accountId = accountId;
    }

    const watchlists = await Watchlist.find(query);

    return res.json({
      success: true,
      watchlists,
    });
  })
);

// POST /api/watchlist - Create a new watchlist
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { accountId, name, marketType, symbols } = req.body;

    if (!accountId || !name || !marketType) {
      return res.status(400).json({
        error: "accountId, name, and marketType are required",
      });
    }

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
  })
);

// GET /api/watchlist/symbols - Get symbols in a watchlist
router.get(
  "/symbols",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { watchlistId, accountId, marketType, noCreate } = req.query;

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

      // If no default watchlist exists and noCreate is not set, create one
      if (!watchlist && noCreate !== "true") {
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

    // Verify ownership of the watchlist if it exists
    if (watchlist && watchlist.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // If no watchlist found (and noCreate was set), return empty result
    if (!watchlist) {
      // Fetch any existing user watchlists for the dropdown
      const existingWatchlists = await Watchlist.find({
        userId,
        accountId,
      }).select("_id name isDefault");

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
  })
);

// POST /api/watchlist/symbols - Add a symbol to a watchlist
router.post(
  "/symbols",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { watchlistId, symbol, accountId, marketType, item } = req.body;

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

    // Verify ownership of the watchlist
    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
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
  })
);

// DELETE /api/watchlist/symbols - Remove a symbol from watchlist
router.delete(
  "/symbols",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { watchlistId, symbol, accountId, marketType } = req.query;

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

    // Verify ownership of the watchlist
    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
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
  })
);

// DELETE /api/watchlist/:id - Delete a watchlist
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Watchlist ID is required" });
    }

    const watchlist = await Watchlist.findById(id);

    if (!watchlist) {
      return res.status(404).json({ error: "Watchlist not found" });
    }

    // Verify ownership of the watchlist
    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await Watchlist.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Watchlist deleted successfully",
    });
  })
);

// GET /api/watchlist/system/:type - Get system watchlist (e.g. all binance futures)
router.get(
  "/system/:type",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type } = req.params;

    if (type !== "binance-futures") {
      return res
        .status(400)
        .json({ error: "Unsupported system watchlist type" });
    }

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
  })
);

export default router;
