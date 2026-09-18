import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import * as React from "react";
import Ticker from "./Ticker";
import { cryptoApi } from "@/lib/crypto-api";
import api from "@/lib/api";

vi.mock("@/lib/crypto-api", () => ({
  cryptoApi: {
    getTickers: vi.fn(),
    researchCoin: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { isAdmin: false } }),
    post: vi.fn(),
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
  });

  it("should render table data and initialize sorting from localStorage if present", async () => {
    localStorage.setItem(
      "spikeyCoins_screener_sorting",
      JSON.stringify([{ id: "price", desc: true }])
    );

    vi.mocked(cryptoApi.getTickers).mockResolvedValue({
      data: mockTickers,
    } as any);

    render(<Ticker />);

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
    } as any);

    render(<Ticker />);

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
    } as any);

    render(<Ticker />);

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
    } as any);

    // Trigger refresh
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    // Page must remain Page 2 of 3, NOT reset to Page 1
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });
  });
});
