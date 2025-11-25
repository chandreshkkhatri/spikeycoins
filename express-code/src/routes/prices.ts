import { Router, Request, Response } from "express";
import binancePriceService from "../lib/binance-price-service";

const router = Router();

// GET /api/prices - Get all cached prices
router.get("/", async (req: Request, res: Response) => {
  try {
    const { symbols } = req.query;

    // If specific symbols requested, filter
    if (symbols && typeof symbols === "string") {
      const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());
      const prices = binancePriceService.getPrices(symbolList);
      return res.json({
        success: true,
        prices,
        count: Object.keys(prices).length,
      });
    }

    // Return all prices
    const prices = binancePriceService.getAllPrices();
    return res.json({
      success: true,
      prices,
      count: Object.keys(prices).length,
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    return res.status(500).json({ error: "Failed to fetch prices" });
  }
});

// GET /api/prices/:symbol - Get price for a specific symbol
router.get("/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const price = binancePriceService.getPrice(upperSymbol);

    if (!price) {
      return res.status(404).json({
        error: "Price not found",
        symbol: upperSymbol,
        hint: "Symbol may not exist or price service is still initializing",
      });
    }

    return res.json({
      success: true,
      ...price,
    });
  } catch (error) {
    console.error("Error fetching price:", error);
    return res.status(500).json({ error: "Failed to fetch price" });
  }
});

// GET /api/prices/stats - Get price service statistics
router.get("/service/stats", async (req: Request, res: Response) => {
  try {
    const stats = binancePriceService.getStats();
    return res.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
