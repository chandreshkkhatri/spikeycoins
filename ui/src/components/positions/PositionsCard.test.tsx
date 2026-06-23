import { describe, it, expect } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/__tests__/test-utils";
import PositionsCard from "./PositionsCard";
import { server } from "@/__tests__/msw/server";
import { http, HttpResponse } from "msw";

describe("PositionsCard Component", () => {
  it("should render positions list with proper broker formatting ($ vs ₹)", async () => {
    const mockAccounts = [
      {
        _id: "acc-binance-p1",
        accountName: "My Binance",
        accountType: "binance" as const,
        isActive: true,
      },
      {
        _id: "acc-upstox-p1",
        accountName: "My Upstox",
        accountType: "upstox" as const,
        isActive: true,
      },
    ];

    const { container } = renderWithProviders(<PositionsCard accounts={mockAccounts} />);

    expect(screen.getByText("Loading positions...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading positions...")).not.toBeInTheDocument();
    });

    // Check portfolio summary values
    expect(screen.getByText("Total Positions")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Check position cards
    // NIFTY position (Upstox)
    expect(screen.getByText("NIFTY26JUNFUT")).toBeInTheDocument();
    expect(screen.getAllByText("UPSTOX")[0]).toBeInTheDocument();
    expect(screen.getByText("NFO")).toBeInTheDocument();
    expect(screen.getAllByText("futures")[0]).toBeInTheDocument();
    expect(screen.getByText("₹23500.00")).toBeInTheDocument(); // Avg
    expect(screen.getByText("₹23600.00")).toBeInTheDocument(); // LTP
    expect(screen.getByText("₹7500.00")).toBeInTheDocument(); // P&L
    expect(screen.getByText("(0.43%)")).toBeInTheDocument(); // P&L %

    // ETHUSDT position (Binance)
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
    expect(screen.getAllByText("BINANCE")[0]).toBeInTheDocument();
    expect(screen.getByText("$3400.00")).toBeInTheDocument(); // Avg
    expect(screen.getByText("$3500.00")).toBeInTheDocument(); // LTP
    expect(screen.getByText("$150.00")).toBeInTheDocument(); // P&L
    expect(screen.getByText("(2.94%)")).toBeInTheDocument(); // P&L %

    // Check visual P&L sign classes (positive/negative classes)
    const positivePnls = container.querySelectorAll(".pnl.positive");
    expect(positivePnls.length).toBeGreaterThanOrEqual(2); // Both are positive in mock
  });

  it("should render empty state when zero accounts are available", () => {
    renderWithProviders(<PositionsCard accounts={[]} />);
    expect(screen.getByText("No Accounts Available")).toBeInTheDocument();
  });

  it("should render empty state when there are no positions", async () => {
    const mockAccountsEmpty = [
      {
        _id: "acc-binance-pempty",
        accountName: "My Binance Empty",
        accountType: "binance" as const,
        isActive: true,
      },
      {
        _id: "acc-upstox-pempty",
        accountName: "My Upstox Empty",
        accountType: "upstox" as const,
        isActive: true,
      },
    ];

    server.use(
      http.get("*/api/positions", () => {
        return HttpResponse.json({
          success: true,
          data: []
        });
      })
    );

    renderWithProviders(<PositionsCard accounts={mockAccountsEmpty} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading positions...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("No open positions")).toBeInTheDocument();
  });
});
