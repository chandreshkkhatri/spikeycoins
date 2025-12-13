import { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();

// GET /api/search/symbols - Search for symbols/instruments
router.get("/symbols", async (req: Request, res: Response) => {
  try {
    const { query, vendor, exchange, segment } = req.query;

    if (!query || !vendor) {
      return res
        .status(400)
        .json({ error: "query and vendor parameters are required" });
    }

    const searchQuery = (query as string).toLowerCase();
    let results: any[] = [];

    if (vendor === "binance") {
      // Search Binance symbols
      try {
        const response = await axios.get(
          "https://api.binance.com/api/v3/exchangeInfo"
        );
        const symbols = response.data.symbols || [];

        results = symbols
          .filter(
            (s: any) =>
              s.symbol.toLowerCase().includes(searchQuery) ||
              s.baseAsset.toLowerCase().includes(searchQuery) ||
              s.quoteAsset.toLowerCase().includes(searchQuery)
          )
          .slice(0, 50)
          .map((s: any) => ({
            symbol: s.symbol,
            name: `${s.baseAsset}/${s.quoteAsset}`,
            exchange: "BINANCE",
            segment: s.status === "TRADING" ? "SPOT" : s.status,
            token: s.symbol,
          }));
      } catch (error) {
        console.error("Error fetching Binance symbols:", error);
      }
    } else if (vendor === "upstox" || vendor === "kite") {
      // For Upstox/Kite, return a helpful message
      // In production, you would integrate with their instrument APIs
      results = [
        {
          symbol: searchQuery.toUpperCase(),
          name: `Search for ${searchQuery} - Upstox/Kite integration pending`,
          exchange: exchange || "NSE",
          segment: segment || "EQ",
          token: searchQuery,
          info: "Please use the official Upstox/Kite instrument database or API for symbol search",
        },
      ];
    }

    return res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Error searching symbols:", error);
    return res.status(500).json({ error: "Failed to search symbols" });
  }
});

export default router;
