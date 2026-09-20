import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradingDataProvider, useTradingData } from "./trading-data-context";
import api from "@/lib/api";

const state = vi.hoisted(() => ({
  selectedAccount: { _id: "a", accountName: "Test", accountType: "binance", isActive: true },
}));
vi.mock("./account-context", () => ({ useAccount: () => state }));
vi.mock("./auth-context", () => ({ useAuth: () => ({ isLoggedIn: true, isLoading: false }) }));
const get = vi.spyOn(api, "get");
let sequence = 0;
const summary = (funds: number, asOf = Date.now()) => ({
  data: { success: true, asOf, positions: [], orders: [],
    accountDetails: { equity: 1000, availableBalance: funds },
    symbolInfo: { verified: true, tickSize: "0.01", stepSize: "0.001", minQty: 0.001, minNotional: 5, maxLeverage: 20 },
  },
});
beforeEach(() => {
  state.selectedAccount = { ...state.selectedAccount, _id: "test-" + (++sequence) };
  get.mockReset();
  get.mockResolvedValue({ data: { success: false } });
  localStorage.clear();
});

describe("trading data provenance", () => {
  it("preserves zero funds and the original source time", async () => {
    const asOf = Date.now() - 10000;
    get.mockImplementation(async url => url === "/trading/summary" ? summary(0, asOf) : { data: { success: false } });
    const { result } = renderHook(() => useTradingData(), { wrapper: TradingDataProvider });
    act(() => result.current.setActiveSymbol("BTCUSDT"));
    await waitFor(() => expect(result.current.dataScope?.asOf).toBe(asOf));
    expect(result.current.accountDetails?.availableBalance).toBe(0);
    expect(result.current.dataScope?.accountId).toBe(state.selectedAccount._id);
  });

  it("ignores a late old-account summary without blocking the new account fetch", async () => {
    const oldAccount = state.selectedAccount._id;
    let resolveOld!: (value: ReturnType<typeof summary>) => void;
    get.mockImplementation(async (url, config) => {
      if (url !== "/trading/summary") return { data: { success: false } };
      if (config?.params.accountId === oldAccount) {
        return new Promise(resolve => { resolveOld = resolve; });
      }
      return summary(25);
    });
    const { result, rerender } = renderHook(() => useTradingData(), { wrapper: TradingDataProvider });
    act(() => result.current.setActiveSymbol("BTCUSDT"));
    await waitFor(() => expect(resolveOld).toBeDefined());
    state.selectedAccount = { ...state.selectedAccount, _id: oldAccount + "-new" };
    rerender();
    await waitFor(() => expect(result.current.dataScope?.accountId).toBe(state.selectedAccount._id));
    await act(async () => { resolveOld(summary(999)); });
    expect(result.current.accountDetails?.availableBalance).toBe(25);
    expect(result.current.dataScope?.accountId).toBe(state.selectedAccount._id);
  });
});
