import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import * as React from "react";
import GainersLosers from "./GainersLosers";
import { cryptoApi } from "@/lib/crypto-api";

vi.mock("@/lib/crypto-api", () => ({
  cryptoApi: {
    get24hrTicker: vi.fn(),
    get7dTopMovers: vi.fn(),
  },
}));

describe("GainersLosers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should keep tab buttons and 24h/7d timeframe toggles visible even in error state", async () => {
    vi.mocked(cryptoApi.get24hrTicker).mockRejectedValue(new Error("Network Failure"));

    render(<GainersLosers />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
    });

    // Verify tabs and timeframe controls remain rendered and functional
    expect(screen.getByRole("button", { name: /top gainers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /top losers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "24h" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7d" })).toBeInTheDocument();
  });

  it("should filter gainers strictly to change > 0 and losers strictly to change < 0", async () => {
    const mockTickers = [
      { s: "BTCUSDT", c: "65000", P: "5.5", q: "1000000" },
      { s: "ETHUSDT", c: "3500", P: "2.1", q: "800000" },
      { s: "SOLUSDT", c: "140", P: "-3.4", q: "500000" },
      { s: "ADAUSDT", c: "0.45", P: "-7.8", q: "200000" },
      { s: "FLATUSDT", c: "1.00", P: "0.0", q: "100000" },
    ];

    vi.mocked(cryptoApi.get24hrTicker).mockResolvedValue({
      data: mockTickers,
    } as any);

    render(<GainersLosers />);

    // In gainers tab (default): should see BTC (+5.5%) and ETH (+2.1%), but NOT SOL, ADA, or FLAT
    await waitFor(() => {
      expect(screen.getByText("BTC")).toBeInTheDocument();
      expect(screen.getByText("ETH")).toBeInTheDocument();
    });
    expect(screen.queryByText("SOL")).not.toBeInTheDocument();
    expect(screen.queryByText("ADA")).not.toBeInTheDocument();
    expect(screen.queryByText("FLAT")).not.toBeInTheDocument();

    // Click losers tab: should see SOL (-3.4%) and ADA (-7.8%), but NOT BTC, ETH, or FLAT
    fireEvent.click(screen.getByRole("button", { name: /top losers/i }));

    await waitFor(() => {
      expect(screen.getByText("SOL")).toBeInTheDocument();
      expect(screen.getByText("ADA")).toBeInTheDocument();
    });
    expect(screen.queryByText("BTC")).not.toBeInTheDocument();
    expect(screen.queryByText("ETH")).not.toBeInTheDocument();
    expect(screen.queryByText("FLAT")).not.toBeInTheDocument();
  });

  it("should fetch 7d top movers when switching to 7d timeframe", async () => {
    vi.mocked(cryptoApi.get24hrTicker).mockResolvedValue({
      data: [{ s: "BTCUSDT", c: "65000", P: "5.0", q: "1000000" }],
    } as any);

    vi.mocked(cryptoApi.get7dTopMovers).mockResolvedValue({
      data: {
        gainers: [
          { symbol: "PEPE", name: "PEPE", price: "0.00001", change_24h: 3, change_7d: 25.5, volume: "50000" },
        ],
        losers: [],
      },
    } as any);

    render(<GainersLosers />);

    await waitFor(() => {
      expect(screen.getByText("BTC")).toBeInTheDocument();
    });

    // Switch to 7d
    fireEvent.click(screen.getByRole("button", { name: "7d" }));

    await waitFor(() => {
      expect(cryptoApi.get7dTopMovers).toHaveBeenCalled();
      expect(screen.getByText("PEPE")).toBeInTheDocument();
    });
  });
});

