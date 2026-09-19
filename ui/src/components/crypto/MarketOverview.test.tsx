import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "@/__tests__/msw/server";
import MarketOverview from "./MarketOverview";

const currentResponse = {
  success: true,
  data: {
    cryptocurrencies: [{
      symbol: "BTC",
      name: "Bitcoin",
      price: 65000,
      change_24h: 2.5,
      volume_usd: 65000000,
    }],
    bitcoin_dominance: {
      dominance: 56.79,
      change_24h: null,
      last_updated: "2026-09-19T12:00:00.000Z",
    },
  },
  meta: {
    status: "current",
    sources: {
      binance: {
        status: "current",
        observed_at: "2026-09-19T12:00:00.000Z",
        last_attempted_at: "2026-09-19T12:00:00.000Z",
      },
      coingecko: {
        status: "current",
        observed_at: "2026-09-19T12:00:00.000Z",
        last_attempted_at: "2026-09-19T12:00:00.000Z",
      },
    },
  },
};

describe("MarketOverview", () => {
  it("renders verified source status and does not invent dominance movement", async () => {
    server.use(
      http.get("*/api/market/overview", () => HttpResponse.json(currentResponse))
    );

    render(<MarketOverview />);

    expect(await screen.findByText("Binance Spot: Current")).toBeInTheDocument();
    expect(screen.getByText("CoinGecko: Current")).toBeInTheDocument();
    expect(screen.getByText("24h change unavailable")).toBeInTheDocument();
    expect(screen.getByText("$65.0K")).toBeInTheDocument();
  });

  it("keeps stale observations visible with an explicit stale label", async () => {
    server.use(
      http.get("*/api/market/overview", () => HttpResponse.json({
        ...currentResponse,
        meta: {
          ...currentResponse.meta,
          status: "stale",
          sources: {
            binance: { ...currentResponse.meta.sources.binance, status: "stale" },
            coingecko: { ...currentResponse.meta.sources.coingecko, status: "stale" },
          },
        },
      }))
    );

    render(<MarketOverview />);

    expect(await screen.findByText("Binance Spot: Stale")).toBeInTheDocument();
    expect(screen.getByText("CoinGecko: Stale")).toBeInTheDocument();
    expect(screen.getByText("$65.0K")).toBeInTheDocument();
  });

  it("offers retry on cold-start unavailability and recovers", async () => {
    let requests = 0;
    server.use(
      http.get("*/api/market/overview", () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json(
            { success: false, error: "Market data not available yet" },
            { status: 503 }
          );
        }
        return HttpResponse.json(currentResponse);
      })
    );

    render(<MarketOverview />);

    expect(await screen.findByText("Verified market data is unavailable.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Binance Spot: Current")).toBeInTheDocument();
    });
  });
});
