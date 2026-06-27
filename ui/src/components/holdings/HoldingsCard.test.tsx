import { describe, it, expect } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/__tests__/test-utils";
import HoldingsCard from "./HoldingsCard";
import { server } from "@/__tests__/msw/server";
import { http, HttpResponse } from "msw";

const mockAccounts = [
  {
    _id: "acc-binance",
    accountName: "My Binance",
    accountType: "binance" as const,
    isActive: true,
  },
  {
    _id: "acc-upstox",
    accountName: "My Upstox",
    accountType: "upstox" as const,
    isActive: true,
  },
];

describe("HoldingsCard Component", () => {
  it("should render holdings list with proper broker formatting ($ vs ₹)", async () => {
    renderWithProviders(<HoldingsCard accounts={mockAccounts} />);

    expect(screen.getByText("Loading holdings...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading holdings...")).not.toBeInTheDocument();
    });

    // Check portfolio summary values
    // totalValue: 25000.00 + 6500.00 = 31500.00
    // totalInvestment: (2400.00 * 10) + (60000.00 * 0.1) = 24000.00 + 6000.00 = 30000.00
    // totalPnl: 1000.00 + 500.00 = 1500.00
    // totalPnlPercentage: (1500 / 30000) * 100 = 5.00%
    expect(screen.getByText("₹31500.00")).toBeInTheDocument(); // Current Value
    expect(screen.getByText("₹30000.00")).toBeInTheDocument(); // Total Investment
    expect(screen.queryByText("₹150000.00")).not.toBeInTheDocument(); // Make sure individual values don't collide in summary

    // Check table rows
    // Reliance row (Upstox)
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("₹2400.00")).toBeInTheDocument(); // Avg price
    expect(screen.getByText("₹2500.00")).toBeInTheDocument(); // LTP
    expect(screen.getByText("₹25000.00")).toBeInTheDocument(); // Value
    expect(screen.getByText("₹1000.00")).toBeInTheDocument(); // P&L
    expect(screen.getByText("4.17%")).toBeInTheDocument(); // Returns %

    // Bitcoin row (Binance)
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("$60000.00")).toBeInTheDocument(); // Avg price
    expect(screen.getByText("$65000.00")).toBeInTheDocument(); // LTP
    expect(screen.getByText("$6500.00")).toBeInTheDocument(); // Value
    expect(screen.getByText("$500.00")).toBeInTheDocument(); // P&L
    expect(screen.getByText("8.33%")).toBeInTheDocument(); // Returns %
  });

  it("should render empty state when zero accounts are available", () => {
    renderWithProviders(<HoldingsCard accounts={[]} />);
    expect(screen.getByText("No Accounts Available")).toBeInTheDocument();
  });

  it("should render empty state when there are no holdings", async () => {
    server.use(
      http.get("*/api/holdings", () => {
        return HttpResponse.json({
          success: true,
          data: []
        });
      })
    );

    renderWithProviders(<HoldingsCard accounts={mockAccounts} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading holdings...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("No holdings in your portfolio")).toBeInTheDocument();
  });

  it("should surface custom 403 permission error banner", async () => {
    server.use(
      http.get("*/api/holdings", () => {
        return HttpResponse.json(
          { isPermissionError: true, error: "Access denied to holdings", suggestion: "Please activate holdings segment" },
          { status: 403 }
        );
      })
    );

    renderWithProviders(<HoldingsCard accounts={[mockAccounts[1]]} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading holdings...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("My Upstox - Permission Required")).toBeInTheDocument();
    expect(screen.getByText("Please activate holdings segment")).toBeInTheDocument();
  });
});
