import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, waitFor, fireEvent } from "@/__tests__/test-utils";
import OrdersCard from "./OrdersCard";
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

describe("OrdersCard integration", () => {
  it("should render orders list with correct broker formatting ($ vs ₹)", async () => {
    const { container } = renderWithProviders(<OrdersCard accounts={mockAccounts} />);

    // Renders loading spinner initially
    expect(screen.getByText("Loading orders...")).toBeInTheDocument();

    // Wait for the data fetch and loading to settle
    await waitFor(() => {
      expect(screen.queryByText("Loading orders...")).not.toBeInTheDocument();
    });

    // Check header/summary information via a query selector to avoid ambiguous matches
    expect(screen.getByText("Total Orders")).toBeInTheDocument();
    const summaryVal = container.querySelector(".summary-item:first-child .summary-value");
    expect(summaryVal?.textContent).toBe("2");

    // Verify Binance Order is rendered with '$' prefix
    expect(screen.getByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.getAllByText("BINANCE")[0]).toBeInTheDocument();
    expect(screen.getAllByText("$65000.00")[0]).toBeInTheDocument();

    // Verify Upstox Order is rendered with '₹' prefix
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("UPSTOX")).toBeInTheDocument();
    expect(screen.getAllByText("₹2500.00")[0]).toBeInTheDocument();
  });

  it("should render empty state when zero accounts are available", () => {
    renderWithProviders(<OrdersCard accounts={[]} />);
    expect(screen.getByText("No Accounts Available")).toBeInTheDocument();
    expect(screen.getByText("Add trading accounts to view your orders.")).toBeInTheDocument();
  });

  it("should render empty state when there are zero orders", async () => {
    // Override MSW response to return empty data
    server.use(
      http.get("*/api/orders", () => {
        return HttpResponse.json({
          success: true,
          data: []
        });
      })
    );

    renderWithProviders(<OrdersCard accounts={mockAccounts} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading orders...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("No orders placed yet")).toBeInTheDocument();
  });

  it("should surface the 'Authentication Required' re-auth UI on 401 response and redirect on click", async () => {
    // Override MSW to return 401 for Upstox orders
    server.use(
      http.get("*/api/orders", ({ request }) => {
        const url = new URL(request.url);
        const vendor = url.searchParams.get("vendor");
        if (vendor === "upstox") {
          return HttpResponse.json(
            { requiresReauth: true, error: "Token expired" },
            { status: 401 }
          );
        }
        // Still return binance orders normally
        return HttpResponse.json({
          success: true,
          data: [
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
              accountId: "acc-binance",
              accountName: "My Binance"
            }
          ]
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

    renderWithProviders(<OrdersCard accounts={mockAccounts} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading orders...")).not.toBeInTheDocument();
    });

    // Check that authentication failure message is displayed
    expect(screen.getByText("My Upstox - Authentication Required")).toBeInTheDocument();
    expect(screen.getByText("Token expired")).toBeInTheDocument();

    const reauthButton = screen.getByRole("button", { name: "Re-authenticate" });
    expect(reauthButton).toBeInTheDocument();

    // Click re-authenticate
    fireEvent.click(reauthButton);

    expect(locationSetter).toHaveBeenCalledWith(
      "/api/auth/upstox/login?accountId=acc-upstox"
    );

    // Restore location using defineProperty
    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });
});
