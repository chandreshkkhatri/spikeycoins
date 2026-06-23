import { http, HttpResponse } from "msw";

export const handlers = [
  // Fetch watchlist symbols
  http.get("*/api/watchlist/symbols", ({ request }) => {
    const url = new URL(request.url);
    const watchlistId = url.searchParams.get("watchlistId");

    // Check Authorization header for Track B verification
    const authHeader = request.headers.get("Authorization");

    return HttpResponse.json({
      success: true,
      symbols: ["BTCUSDT", "ETHUSDT"],
      items: [
        { symbol: "BTCUSDT" },
        { symbol: "ETHUSDT" }
      ],
      watchlist: {
        id: watchlistId || "watchlist-123",
        name: "Default Watchlist"
      },
      watchlists: [
        {
          id: "watchlist-123",
          name: "Default Watchlist",
          isDefault: true
        }
      ],
      _authHeader: authHeader, // useful helper to pass check to test if needed
    });
  }),

  // Fetch system watchlist
  http.get("*/api/watchlist/system/binance-futures", () => {
    return HttpResponse.json({
      success: true,
      watchlistId: "system-binance-futures",
      watchlistName: "Binance Futures",
      symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      items: [
        { symbol: "BTCUSDT" },
        { symbol: "ETHUSDT" },
        { symbol: "SOLUSDT" }
      ]
    });
  }),

  // Add/Update symbols in watchlist
  http.post("*/api/watchlist/symbols", () => {
    return HttpResponse.json({
      success: true
    });
  }),

  // Create watchlist
  http.post("*/api/watchlist", () => {
    return HttpResponse.json({
      success: true,
      watchlist: {
        _id: "new-watchlist-456",
        name: "My New Watchlist",
      }
    });
  }),

  // Delete watchlist
  http.delete("*/api/watchlist/:watchlistId", () => {
    return HttpResponse.json({
      success: true
    });
  }),

  // Fetch prices
  http.get("*/api/prices", () => {
    return HttpResponse.json({
      success: true,
      prices: {
        BTCUSDT: {
          lastPrice: 65000.0,
          priceChange: 1500.0,
          priceChangePercent: 2.3,
          volume: 12000.0,
          high: 66000.0,
          low: 63000.0
        },
        ETHUSDT: {
          lastPrice: 3500.0,
          priceChange: -50.0,
          priceChangePercent: -1.4,
          volume: 45000.0,
          high: 36000.0,
          low: 34000.0
        }
      }
    });
  }),

  // Fetch orders
  http.get("*/api/orders", ({ request }) => {
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const vendor = url.searchParams.get("vendor");

    const allOrders = [
      {
        id: "order-1",
        symbol: "BTCUSDT",
        exchange: "BINANCE",
        quantity: 0.5,
        price: 65000.00,
        averagePrice: 65000.00,
        orderType: "limit",
        transactionType: "buy",
        status: "filled",
        product: "futures",
        validity: "gtc",
        filledQuantity: 0.5,
        pendingQuantity: 0,
        timestamp: "2026-06-23T04:00:00Z",
        vendor: "binance",
        accountId: accountId || "acc-binance",
        accountName: "My Binance"
      },
      {
        id: "order-2",
        symbol: "RELIANCE",
        exchange: "NSE",
        quantity: 10,
        price: 2500.00,
        averagePrice: 0,
        orderType: "limit",
        transactionType: "buy",
        status: "open",
        product: "cnc",
        validity: "day",
        filledQuantity: 0,
        pendingQuantity: 10,
        timestamp: "2026-06-23T04:05:00Z",
        vendor: "upstox",
        accountId: accountId || "acc-upstox",
        accountName: "My Upstox"
      }
    ];

    const filtered = allOrders.filter(
      (order) => !vendor || order.vendor.toLowerCase() === vendor.toLowerCase()
    );

    return HttpResponse.json({
      success: true,
      data: filtered,
    });
  }),

  // Fetch funds
  http.get("*/api/funds", ({ request }) => {
    requestCounters.funds++;
    const url = new URL(request.url);
    const vendor = url.searchParams.get("vendor");

    const isUpstox = vendor === "upstox";
    const funds = isUpstox
      ? {
          totalBalance: "150000.00",
          availableBalance: "125000.00",
          usedMargin: "25000.00",
          unrealizedPnl: "1500.00",
        }
      : {
          totalBalance: "2500.50",
          availableBalance: "2200.00",
          usedMargin: "300.50",
          unrealizedPnl: "-50.25",
        };

    return HttpResponse.json({
      success: true,
      funds,
    });
  }),

  // Fetch holdings
  http.get("*/api/holdings", ({ request }) => {
    requestCounters.holdings++;
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const vendor = url.searchParams.get("vendor");

    const allHoldings = [
      {
        id: "holding-1",
        symbol: "RELIANCE",
        exchange: "NSE",
        quantity: 10,
        averagePrice: 2400.00,
        lastPrice: 2500.00,
        currentValue: 25000.00,
        pnl: 1000.00,
        pnlPercentage: 4.17,
        companyName: "Reliance Industries Ltd.",
        isin: "INE002A01018",
        vendor: "upstox",
        accountId: accountId || "acc-upstox",
        accountName: "My Upstox"
      },
      {
        id: "holding-2",
        symbol: "BTC",
        exchange: "BINANCE",
        quantity: 0.1,
        averagePrice: 60000.00,
        lastPrice: 65000.00,
        currentValue: 6500.00,
        pnl: 500.00,
        pnlPercentage: 8.33,
        companyName: "Bitcoin",
        vendor: "binance",
        accountId: accountId || "acc-binance",
        accountName: "My Binance"
      }
    ];

    const filtered = allHoldings.filter(
      (h) => !vendor || h.vendor.toLowerCase() === vendor.toLowerCase()
    );

    return HttpResponse.json({
      success: true,
      data: filtered,
    });
  }),

  // Fetch positions
  http.get("*/api/positions", ({ request }) => {
    requestCounters.positions++;
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const vendor = url.searchParams.get("vendor");

    const allPositions = [
      {
        id: "position-1",
        symbol: "NIFTY26JUNFUT",
        exchange: "NFO",
        quantity: 75,
        averagePrice: 23500.00,
        lastPrice: 23600.00,
        pnl: 7500.00,
        pnlPercentage: 0.43,
        product: "futures",
        vendor: "upstox",
        accountId: accountId || "acc-upstox",
        accountName: "My Upstox"
      },
      {
        id: "position-2",
        symbol: "ETHUSDT",
        exchange: "BINANCE",
        quantity: 1.5,
        averagePrice: 3400.00,
        lastPrice: 3500.00,
        pnl: 150.00,
        pnlPercentage: 2.94,
        product: "futures",
        vendor: "binance",
        accountId: accountId || "acc-binance",
        accountName: "My Binance"
      }
    ];

    const filtered = allPositions.filter(
      (p) => !vendor || p.vendor.toLowerCase() === vendor.toLowerCase()
    );

    return HttpResponse.json({
      success: true,
      data: filtered,
    });
  }),
];

export const requestCounters = {
  funds: 0,
  holdings: 0,
  positions: 0,
};

