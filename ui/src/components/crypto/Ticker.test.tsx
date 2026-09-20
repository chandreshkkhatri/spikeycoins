import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import Ticker from "./Ticker";
import { cryptoApi } from "@/lib/crypto-api";
import api from "@/lib/api";
import { renderWithProviders } from "@/__tests__/test-utils";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/crypto-api", () => ({
  cryptoApi: {
    getTickers: vi.fn(),
    get7dTopMovers: vi.fn(),
    researchCoin: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { isAdmin: false } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

describe("Ticker Screener", () => {
  const mockTickers = Array.from({ length: 45 }, (_, i) => ({
    s: `COIN${i + 1}USDT`,
    price: 10 + i,
    change_24h: (i % 2 === 0 ? 1 : -1) * (i + 1),
    high_24h: 12 + i,
    low_24h: 9 + i,
    range_position_24h: 50,
    volume_usd: 100000 + i * 1000,
    volume_base: 5000,
    normalized_volume_score: 50,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState(null, "", "/market-watch/screener");
    vi.mocked(cryptoApi.get7dTopMovers).mockResolvedValue({
      data: { data: { gainers: [], losers: [] } },
    } as never);
  });

  it("should render table data and initialize sorting from localStorage if present", async () => {
    localStorage.setItem(
      "spikeyCoins_screener_sorting",
      JSON.stringify([{ id: "price", desc: true }])
    );

    vi.mocked(cryptoApi.getTickers).mockResolvedValue({
      data: mockTickers,
    } as never);

    renderWithProviders(<Ticker />);

    await waitFor(() => {
      // Symbol renders as COIN45/USDT
      expect(screen.getByText("COIN45/USDT")).toBeInTheDocument();
    });

    // Verify localStorage item was read and updated
    expect(localStorage.getItem("spikeyCoins_screener_sorting")).toContain("price");
  });

  it("should preserve existing data and show a banner when background refresh fails", async () => {
    // 1. Initial success
    vi.mocked(cryptoApi.getTickers).mockResolvedValueOnce({
      data: mockTickers,
    } as never);

    renderWithProviders(<Ticker />);

    await waitFor(() => {
      expect(screen.getByText("45 USDT trading pairs available")).toBeInTheDocument();
    });

    // 2. Subsequent background refresh fails
    vi.mocked(cryptoApi.getTickers).mockRejectedValueOnce(new Error("Network glitch"));

    // Click refresh button to trigger fetchTickers(true) or simulate background failure
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    // Background failure must preserve table data and display cached data banner
    await waitFor(() => {
      expect(screen.getByText(/Market feed update failed. Displaying cached data/i)).toBeInTheDocument();
    });

    // Verify table pairs are STILL rendered and not wiped
    expect(screen.getByText("45 USDT trading pairs available")).toBeInTheDocument();
    expect(screen.getByText("COIN45/USDT")).toBeInTheDocument();
  });

  it("should navigate pages and maintain pagination without reset when autoResetPageIndex is false", async () => {
    vi.mocked(cryptoApi.getTickers).mockResolvedValue({
      data: mockTickers,
    } as never);

    renderWithProviders(<Ticker />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    // Click Next button to go to Page 2
    const nextBtn = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    // Simulate background data update (same or updated items)
    vi.mocked(cryptoApi.getTickers).mockResolvedValueOnce({
      data: [...mockTickers],
    } as never);

    // Trigger refresh
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    // Page must remain Page 2 of 3, NOT reset to Page 1
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });
  });

  it("restores a selected symbol from the URL and normalizes displayed pair searches", async () => {
    window.history.replaceState(
      null,
      "",
      "/market-watch/screener?symbol=COIN2USDT&timeframe=24h"
    );
    vi.mocked(cryptoApi.getTickers).mockResolvedValue({ data: mockTickers } as never);

    renderWithProviders(<Ticker />);

    expect(await screen.findByRole("heading", { name: "COIN2/USDT" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search pairs...")).toHaveValue("COIN2USDT");

    await userEvent.clear(screen.getByPlaceholderText("Search pairs..."));
    await userEvent.type(screen.getByPlaceholderText("Search pairs..."), "COIN3/USDT");

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get("q")).toBe("COIN3/USDT");
    });
    expect(screen.getByText("COIN3/USDT")).toBeInTheDocument();
  });

  it("loads real seven-day values and preserves loser ordering from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/market-watch/screener?direction=losers&timeframe=7d"
    );
    localStorage.setItem(
      "spikeyCoins_screener_sorting",
      JSON.stringify([{ id: "price", desc: true }])
    );
    vi.mocked(cryptoApi.getTickers).mockResolvedValue({ data: mockTickers.slice(0, 3) } as never);
    vi.mocked(cryptoApi.get7dTopMovers).mockResolvedValue({
      data: {
        data: {
          gainers: [{ symbol: "COIN1", change_7d: 8 }],
          losers: [
            { symbol: "COIN2", change_7d: -12 },
            { symbol: "COIN3", change_7d: -4 },
          ],
        },
      },
    } as never);

    renderWithProviders(<Ticker />);

    await waitFor(() => {
      expect(cryptoApi.get7dTopMovers).toHaveBeenCalledWith(500);
    });
    expect(screen.getByRole("button", { name: /7d change/i })).toBeInTheDocument();
    expect(screen.getByText("COIN2/USDT")).toBeInTheDocument();
    expect(screen.getByText("COIN3/USDT")).toBeInTheDocument();
    expect(screen.queryByText("COIN1/USDT")).not.toBeInTheDocument();
    expect(screen.getByText("-12.00%")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("COIN2/USDT");
  });

  it("saves an instrument and opens Terminal with a same-scan return URL", async () => {
    vi.mocked(cryptoApi.getTickers).mockResolvedValue({ data: mockTickers.slice(0, 1) } as never);
    renderWithProviders(<Ticker />);

    await screen.findByText("COIN1/USDT");
    await userEvent.click(screen.getByRole("button", { name: "Add to watchlist COIN1USDT" }));

    expect(api.post).toHaveBeenCalledWith("/watchlist/symbols", {
      accountId: "acc-binance",
      marketType: "binance-futures",
      symbol: "COIN1USDT",
    });
    expect(await screen.findByText(/added to your watchlist/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open COIN1USDT in Terminal" }));
    expect(routerPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/terminal\?symbol=COIN1USDT&returnTo=/)
    );
  });
});
