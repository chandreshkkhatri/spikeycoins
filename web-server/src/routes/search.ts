import { Router, Request, Response } from "express";
import axios from "axios";
import * as zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);
const router: Router = Router();

// Cache for Upstox instruments (exchange -> instruments array)
interface UpstoxInstrument {
  instrument_key: string;
  exchange_token: string;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry?: string;
  strike?: number;
  tick_size: number;
  lot_size: number;
  instrument_type: string;
  option_type?: string;
  exchange: string;
  segment: string;
}

const upstoxInstrumentCache: Map<
  string,
  {
    data: UpstoxInstrument[];
    timestamp: number;
  }
> = new Map();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Upstox instrument file URLs
const UPSTOX_INSTRUMENT_URLS: Record<string, string> = {
  NSE: "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  BSE: "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz",
  MCX: "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz",
  NFO: "https://assets.upstox.com/market-quote/instruments/exchange/NFO.json.gz",
  BFO: "https://assets.upstox.com/market-quote/instruments/exchange/BFO.json.gz",
  CDS: "https://assets.upstox.com/market-quote/instruments/exchange/CDS.json.gz",
  BCD: "https://assets.upstox.com/market-quote/instruments/exchange/BCD.json.gz",
};

async function fetchUpstoxInstruments(
  exchange: string,
): Promise<UpstoxInstrument[]> {
  const cached = upstoxInstrumentCache.get(exchange);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = UPSTOX_INSTRUMENT_URLS[exchange];
  if (!url) {
    console.warn(`No instrument URL for exchange: ${exchange}`);
    return [];
  }

  try {
    console.log(`Fetching Upstox instruments for ${exchange}...`);
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const decompressed = await gunzip(response.data);
    const instruments: UpstoxInstrument[] = JSON.parse(decompressed.toString());

    upstoxInstrumentCache.set(exchange, {
      data: instruments,
      timestamp: Date.now(),
    });

    console.log(`Cached ${instruments.length} instruments for ${exchange}`);
    return instruments;
  } catch (error: any) {
    console.error(
      `Error fetching Upstox instruments for ${exchange}:`,
      error.message,
    );
    // Return cached data if available, even if stale
    if (cached) {
      console.log(`Using stale cache for ${exchange}`);
      return cached.data;
    }
    return [];
  }
}

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
          "https://api.binance.com/api/v3/exchangeInfo",
        );
        const symbols = response.data.symbols || [];

        results = symbols
          .filter(
            (s: any) =>
              s.symbol.toLowerCase().includes(searchQuery) ||
              s.baseAsset.toLowerCase().includes(searchQuery) ||
              s.quoteAsset.toLowerCase().includes(searchQuery),
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
      // Determine which exchanges to search
      let exchangesToSearch: string[] = [];

      if (segment && segment !== "ALL") {
        // Map segment to exchange
        const segmentStr = segment as string;
        if (segmentStr.startsWith("NSE_")) {
          exchangesToSearch = segmentStr === "NSE_FO" ? ["NFO"] : ["NSE"];
        } else if (segmentStr.startsWith("BSE_")) {
          exchangesToSearch = segmentStr === "BSE_FO" ? ["BFO"] : ["BSE"];
        } else if (segmentStr.startsWith("MCX")) {
          exchangesToSearch = ["MCX"];
        } else if (segmentStr === "BCD_FO") {
          exchangesToSearch = ["BCD"];
        } else if (segmentStr === "NCD_FO" || segmentStr === "NSE_COM") {
          exchangesToSearch = ["CDS"];
        } else {
          exchangesToSearch = ["NSE", "BSE"];
        }
      } else if (exchange && exchange !== "ALL") {
        const exch = (exchange as string).toUpperCase();
        if (exch === "NSE") exchangesToSearch = ["NSE", "NFO"];
        else if (exch === "BSE") exchangesToSearch = ["BSE", "BFO"];
        else if (exch === "MCX") exchangesToSearch = ["MCX"];
        else exchangesToSearch = [exch];
      } else {
        // Search all major exchanges
        exchangesToSearch = ["NSE", "BSE", "MCX", "NFO"];
      }

      // Fetch instruments from all relevant exchanges in parallel
      const instrumentPromises = exchangesToSearch.map(fetchUpstoxInstruments);
      const allInstrumentArrays = await Promise.all(instrumentPromises);
      const allInstruments = allInstrumentArrays.flat();

      // Search through instruments
      const matchingInstruments = allInstruments.filter((inst) => {
        const symbolMatch = inst.tradingsymbol
          ?.toLowerCase()
          .includes(searchQuery);
        const nameMatch = inst.name?.toLowerCase().includes(searchQuery);
        return symbolMatch || nameMatch;
      });

      // Sort by relevance (exact match first, then starts with, then contains)
      matchingInstruments.sort((a, b) => {
        const aSymbol = a.tradingsymbol?.toLowerCase() || "";
        const bSymbol = b.tradingsymbol?.toLowerCase() || "";
        const aName = a.name?.toLowerCase() || "";
        const bName = b.name?.toLowerCase() || "";

        // Exact symbol match first
        if (aSymbol === searchQuery && bSymbol !== searchQuery) return -1;
        if (bSymbol === searchQuery && aSymbol !== searchQuery) return 1;

        // Symbol starts with query
        if (aSymbol.startsWith(searchQuery) && !bSymbol.startsWith(searchQuery))
          return -1;
        if (bSymbol.startsWith(searchQuery) && !aSymbol.startsWith(searchQuery))
          return 1;

        // Name starts with query
        if (aName.startsWith(searchQuery) && !bName.startsWith(searchQuery))
          return -1;
        if (bName.startsWith(searchQuery) && !aName.startsWith(searchQuery))
          return 1;

        // Alphabetical
        return aSymbol.localeCompare(bSymbol);
      });

      // Map to result format and limit to 50
      results = matchingInstruments.slice(0, 50).map((inst) => ({
        symbol: inst.tradingsymbol,
        name: inst.name || inst.tradingsymbol,
        exchange: inst.exchange,
        segment: inst.segment,
        instrument_type: inst.instrument_type,
        token: inst.instrument_key,
        expiry: inst.expiry,
        strike: inst.strike,
        lot_size: inst.lot_size,
      }));
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
