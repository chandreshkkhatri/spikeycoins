import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, waitFor, fireEvent } from "@/__tests__/test-utils";
import FundsCard from "./FundsCard";
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

describe("FundsCard Component", () => {
  it("should render funds for each account and display totals summary when multiple accounts exist", async () => {
    renderWithProviders(<FundsCard accounts={mockAccounts} />);

    // Shows loading initially
    expect(screen.getByText("Loading funds...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading funds...")).not.toBeInTheDocument();
    });

    // Check individual account balance rows
    expect(screen.getByText("My Binance")).toBeInTheDocument();
    expect(screen.getByText("$2500.50")).toBeInTheDocument(); // Binance formatted total
    expect(screen.getByText("$2200.00")).toBeInTheDocument(); // Binance formatted available

    expect(screen.getByText("My Upstox")).toBeInTheDocument();
    expect(screen.getByText("₹150000.00")).toBeInTheDocument(); // Upstox formatted total
    expect(screen.getByText("₹125000.00")).toBeInTheDocument(); // Upstox formatted available

    // Multi-account summary totals
    // Total Balance: 2500.50 + 150000.00 = 152500.50
    // Total Available: 2200.00 + 125000.00 = 127200.00
    // Total Unrealized: -50.25 + 1500.00 = 1449.75
    expect(screen.getByText("Total Balance")).toBeInTheDocument();
    expect(screen.getByText("₹152500.50")).toBeInTheDocument();
    expect(screen.getByText("₹127200.00")).toBeInTheDocument();
    expect(screen.getByText("₹1449.75")).toBeInTheDocument();
  });

  it("should render empty state when zero accounts are available", () => {
    renderWithProviders(<FundsCard accounts={[]} />);
    expect(screen.getByText("No Accounts Available")).toBeInTheDocument();
    expect(screen.getByText("Add trading accounts to view your funds and balances.")).toBeInTheDocument();
  });

  it("should render empty state when there is no funds data", async () => {
    server.use(
      http.get("*/api/funds", () => {
        return HttpResponse.json({
          success: true,
          funds: null
        });
      })
    );

    renderWithProviders(<FundsCard accounts={[mockAccounts[0]]} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading funds...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Failed to load funds")).toBeInTheDocument();
  });

  it("should surface authentication error and handle re-authentication click", async () => {
    server.use(
      http.get("*/api/funds", ({ request }) => {
        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId");
        if (accountId === "acc-upstox") {
          return HttpResponse.json(
            { requiresReauth: true, error: "Access token invalid or expired" },
            { status: 401 }
          );
        }
        return HttpResponse.json({
          success: true,
          funds: {
            totalBalance: "2500.50",
            availableBalance: "2200.00",
          }
        });
      })
    );

    // Mock window.location
    const originalLocation = window.location;
    const locationSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        set href(url: string) {
          locationSetter(url);
        },
        get href() {
          return "http://localhost/";
        }
      },
      configurable: true,
      writable: true,
    });

    renderWithProviders(<FundsCard accounts={mockAccounts} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading funds...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("My Upstox - Authentication Required")).toBeInTheDocument();
    expect(screen.getByText("Access token invalid or expired")).toBeInTheDocument();

    const reauthBtn = screen.getByRole("button", { name: "Re-authenticate" });
    expect(reauthBtn).toBeInTheDocument();
    fireEvent.click(reauthBtn);

    expect(locationSetter).toHaveBeenCalledWith("/api/auth/upstox/login?accountId=acc-upstox");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });
});
