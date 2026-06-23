import { describe, it, expect } from "vitest";
import { renderHookWithProviders, waitFor, seedAccessToken, act } from "@/__tests__/test-utils";
import { useWatchlist } from "./useWatchlist";
import { server } from "@/__tests__/msw/server";
import { http, HttpResponse, delay } from "msw";
import binanceWebSocketService from "@/lib/binance-websocket";
import { upstoxWebSocket } from "@/lib/upstox-websocket";

const mockBinanceAccount = {
  _id: "acc-binance",
  accountName: "My Binance",
  accountType: "binance" as const,
  isActive: true,
};

const mockUpstoxAccount = {
  _id: "acc-upstox",
  accountName: "My Upstox",
  accountType: "upstox" as const,
  isActive: true,
};

const mockAccounts = [mockBinanceAccount, mockUpstoxAccount];

describe("useWatchlist integration", () => {
  it("should fetch symbols, load initial watchlist items, and carry the auth header", async () => {
    seedAccessToken("test-jwt-token");

    let capturedHeaders: Headers | null = null;
    server.use(
      http.get("*/api/watchlist/symbols", ({ request }) => {
        capturedHeaders = request.headers;
        return HttpResponse.json({
          success: true,
          symbols: ["BTCUSDT", "ETHUSDT"],
          items: [],
          watchlist: { id: "wl-123", name: "Default" },
          watchlists: [{ id: "wl-123", name: "Default" }]
        });
      })
    );

    const { result } = renderHookWithProviders(() =>
      useWatchlist({
        selectedAccount: mockUpstoxAccount,
        accounts: mockAccounts,
        marketType: "upstox-equity"
      })
    );

    // Initial loading state
    expect(result.current.loading).toBe(true);

    // Wait for the fetch effect to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.watchlistSymbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(result.current.watchlistItems).toHaveLength(2);
    expect(result.current.currentWatchlistId).toBe("wl-123");

    // Verify authentication headers
    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get("Authorization")).toBe("Bearer test-jwt-token");

    // Verify WebSocket subscription on mount
    expect(upstoxWebSocket.connect).toHaveBeenCalled();
  });

  it("should load the Binance system watchlist when currentWatchlistId is null and accountType is binance", async () => {
    const { result } = renderHookWithProviders(() =>
      useWatchlist({
        selectedAccount: mockBinanceAccount,
        accounts: mockAccounts,
        marketType: "binance-futures"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentWatchlistId).toBe("system-binance-futures");
    expect(result.current.currentWatchlistName).toBe("Binance Futures");
    expect(result.current.watchlistSymbols).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);

    // Verify Binance websocket connection
    expect(binanceWebSocketService.connect).toHaveBeenCalled();
  });

  it("should optimistically add a symbol and then roll back if backend persistence fails", async () => {
    // Intercept POST /api/watchlist/symbols to return error with a delay
    server.use(
      http.post("*/api/watchlist/symbols", async () => {
        await delay(100);
        return HttpResponse.json({ error: "DB Error" }, { status: 500 });
      })
    );

    const { result } = renderHookWithProviders(() =>
      useWatchlist({
        selectedAccount: mockBinanceAccount,
        accounts: mockAccounts,
        marketType: "binance-futures"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCount = result.current.watchlistSymbols.length;
    expect(result.current.watchlistSymbols).not.toContain("ADAUSDT");

    // Call addSymbol inside act
    act(() => {
      result.current.addSymbol({ symbol: "ADAUSDT", name: "Cardano" });
    });

    // Optimistic insert verification (visible during the 100ms MSW delay)
    expect(result.current.watchlistSymbols).toContain("ADAUSDT");
    expect(result.current.watchlistSymbols.length).toBe(initialCount + 1);

    // Rollback verification (state reverts back to initial because of API failure)
    await waitFor(() => {
      expect(result.current.watchlistSymbols).not.toContain("ADAUSDT");
      expect(result.current.watchlistSymbols.length).toBe(initialCount);
    });

    expect(result.current.error).toBe("Failed to add symbol to watchlist");
  });

  it("should remove a symbol locally and persist it to backend", async () => {
    let capturedBody: { symbol?: string; items?: unknown[] } | null = null;
    server.use(
      http.post("*/api/watchlist/symbols", async ({ request }) => {
        capturedBody = (await request.json()) as { symbol?: string; items?: unknown[] };
        return HttpResponse.json({ success: true });
      })
    );

    const { result } = renderHookWithProviders(() =>
      useWatchlist({
        selectedAccount: mockBinanceAccount,
        accounts: mockAccounts,
        marketType: "binance-futures"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.watchlistSymbols).toContain("BTCUSDT");

    // Call removeSymbol inside act
    act(() => {
      result.current.removeSymbol("BTCUSDT");
    });

    // Local update verification
    expect(result.current.watchlistSymbols).not.toContain("BTCUSDT");

    // Wait for the api call to be triggered
    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    const body = capturedBody as unknown as { symbol?: string; items?: unknown[] };
    expect(body.symbol).toBeUndefined(); // removed via items rewrite body format
    expect(body.items).toBeInstanceOf(Array);
  });

  it("should sort and filter watchlist items correctly", async () => {
    const { result } = renderHookWithProviders(() =>
      useWatchlist({
        selectedAccount: mockBinanceAccount,
        accounts: mockAccounts,
        marketType: "binance-futures"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Default sorting is by symbol ascending
    expect(result.current.filteredWatchlistItems[0].symbol).toBe("BTCUSDT");
    expect(result.current.filteredWatchlistItems[1].symbol).toBe("ETHUSDT");
    expect(result.current.filteredWatchlistItems[2].symbol).toBe("SOLUSDT");

    // Toggle sort order for "symbol" (should trigger desc) inside act
    act(() => {
      result.current.handleSort("symbol");
    });
    
    expect(result.current.filteredWatchlistItems[0].symbol).toBe("SOLUSDT");
    expect(result.current.filteredWatchlistItems[1].symbol).toBe("ETHUSDT");
    expect(result.current.filteredWatchlistItems[2].symbol).toBe("BTCUSDT");

    // Filter using searchQuery inside act
    act(() => {
      result.current.setSearchQuery("ET");
    });
    
    expect(result.current.filteredWatchlistItems).toHaveLength(1);
    expect(result.current.filteredWatchlistItems[0].symbol).toBe("ETHUSDT");
  });

  it("should set error and clear items if the symbols api returns non-OK response", async () => {
    server.use(
      http.get("*/api/watchlist/symbols", () => {
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      })
    );

    const { result } = renderHookWithProviders(() =>
      useWatchlist({
        selectedAccount: mockUpstoxAccount,
        accounts: mockAccounts,
        marketType: "upstox-equity"
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("Watchlist API 401");
    expect(result.current.watchlistItems).toHaveLength(0);
    expect(result.current.watchlistSymbols).toHaveLength(0);
  });
});
