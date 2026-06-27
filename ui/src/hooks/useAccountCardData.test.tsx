import { act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../__tests__/msw/server";
import { requestCounters } from "../__tests__/msw/handlers";
import { useAccountCardData } from "./useAccountCardData";
import { renderHookWithProviders } from "../__tests__/test-utils";
import { TradingAccount } from "./account-card-types";

describe("useAccountCardData Hook", () => {
  beforeEach(() => {
    requestCounters.funds = 0;
    requestCounters.holdings = 0;
    requestCounters.positions = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("populates data and sets loading state on initial load", async () => {
    const accounts: TradingAccount[] = [
      { _id: "acc-binance-1", accountName: "Binance 1", accountType: "binance", isActive: true }
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/funds",
        accounts,
        extractItems: (res, acc) => [{ ...(res.funds as Record<string, unknown>), accountId: acc._id }],
      })
    );

    // Initial state: loading should be true
    expect(result.current.loading).toBe(true);

    // Wait for the hook to finish loading
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]).toMatchObject({
      accountId: "acc-binance-1",
      totalBalance: "2500.50",
    });
  });

  it("filters to a single account when selectedAccountId is provided", async () => {
    const accounts: TradingAccount[] = [
      { _id: "acc-binance-2", accountName: "Binance 2", accountType: "binance", isActive: true },
      { _id: "acc-upstox-2", accountName: "Upstox 2", accountType: "upstox", isActive: true },
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/funds",
        accounts,
        selectedAccountId: "acc-upstox-2",
        extractItems: (res, acc) => [{ ...(res.funds as Record<string, unknown>), accountId: acc._id }],
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].accountId).toBe("acc-upstox-2");
    expect(requestCounters.funds).toBe(1);
  });

  it("aggregates data from multiple accounts when selectedAccountId is not set", async () => {
    const accounts: TradingAccount[] = [
      { _id: "acc-binance-3", accountName: "Binance 3", accountType: "binance", isActive: true },
      { _id: "acc-upstox-3", accountName: "Upstox 3", accountType: "upstox", isActive: true },
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/funds",
        accounts,
        extractItems: (res, acc) => [{ ...(res.funds as Record<string, unknown>), accountId: acc._id }],
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toHaveLength(2);
    expect(requestCounters.funds).toBe(2);
  });

  it("handles 401 error and populates requiresReauth in accountErrors", async () => {
    server.use(
      http.get("*/api/funds", () => {
        return new HttpResponse(
          JSON.stringify({ error: "Session expired", requiresReauth: true }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const accounts: TradingAccount[] = [
      { _id: "acc-binance-4", accountName: "Binance 4", accountType: "binance", isActive: true }
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/funds",
        accounts,
        extractItems: (res, acc) => [{ ...(res.funds as Record<string, unknown>), accountId: acc._id }],
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.accountErrors).toHaveLength(1);
    expect(result.current.accountErrors[0]).toMatchObject({
      accountId: "acc-binance-4",
      requiresReauth: true,
      message: "Session expired",
    });
    expect(result.current.error).toBeNull();
  });

  it("handles custom holdings 403 permission error via classifyError", async () => {
    server.use(
      http.get("*/api/holdings", () => {
        return new HttpResponse(
          JSON.stringify({ error: "Permission Denied", isPermissionError: true, suggestion: "Activate segment" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const accounts: TradingAccount[] = [
      { _id: "acc-upstox-5", accountName: "Upstox 5", accountType: "upstox", isActive: true }
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/holdings",
        accounts,
        extractItems: (res) => (Array.isArray(res?.data) ? res.data : []),
        classifyError: (err, account) => {
          if (err.response?.status === 403 && err.response?.data?.isPermissionError) {
            return {
              accountId: account._id,
              accountName: account.accountName,
              requiresReauth: false,
              message: (err.response.data.suggestion || err.response.data.error) as string,
            };
          }
          return null;
        },
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.accountErrors).toHaveLength(1);
    expect(result.current.accountErrors[0]).toMatchObject({
      accountId: "acc-upstox-5",
      requiresReauth: false,
      message: "Activate segment",
    });
  });

  it("deduplicates parallel in-flight requests and handles bypass/expiration", async () => {
    // Enable fake timers to control cache expiration
    vi.useFakeTimers();

    const accounts: TradingAccount[] = [
      { _id: "acc-binance-6", accountName: "Binance 6", accountType: "binance", isActive: true }
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/positions",
        accounts,
        extractItems: (res) => (Array.isArray(res?.data) ? res.data : []),
        dedupeInFlight: true,
      })
    );

    // Let the initial mounting effect fire
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    // Wait for the initial cache to expire
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    // Reset positions request counter to 0 to isolate parallel request counting
    requestCounters.positions = 0;

    // Call refetchAll two times simultaneously
    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    act(() => {
      p1 = result.current.refetchAll();
      p2 = result.current.refetchAll();
    });

    // Run pending timers & wait for promises to resolve
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.all([p1, p2]);
    });

    // The two parallel calls should share the same network request
    expect(requestCounters.positions).toBe(1);

    // Call refresh (bypasses cache)
    let pRefresh: Promise<void> | undefined;
    act(() => {
      pRefresh = result.current.refresh(accounts[0]);
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
      await pRefresh;
    });

    // Should bypass cache and make another network request
    expect(requestCounters.positions).toBe(2);

    // Advance time by 2.1 seconds to expire cache entries
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    // Fire refetchAll again
    let pPostExpire: Promise<void> | undefined;
    act(() => {
      pPostExpire = result.current.refetchAll();
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
      await pPostExpire;
    });

    // Cache was expired, so a new request is made
    expect(requestCounters.positions).toBe(3);
  });

  it("sets general error state on non-401 non-classified errors", async () => {
    server.use(
      http.get("*/api/funds", () => {
        return new HttpResponse(
          JSON.stringify({ error: "Internal Server Error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const accounts: TradingAccount[] = [
      { _id: "acc-binance-7", accountName: "Binance 7", accountType: "binance", isActive: true }
    ];

    const { result } = renderHookWithProviders(() =>
      useAccountCardData({
        endpoint: "/funds",
        accounts,
        extractItems: (res, acc) => [{ ...(res.funds as Record<string, unknown>), accountId: acc._id }],
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Binance 7: Internal Server Error");
    expect(result.current.accountErrors).toHaveLength(0);
  });
});
