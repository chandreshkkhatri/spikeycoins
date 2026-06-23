import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/__tests__/test-utils";
import api from "@/lib/api";
import TradingWindow from "./TradingWindow";

const createDefaultTradingData = () => ({
  orders: [],
  accountDetails: {
    equity: 1000,
    availableBalance: 1000,
    marginRatio: 12,
    maintenanceMargin: 25,
    positionValue: 300,
    actualLeverage: 3,
    unrealizedPNL: 15,
  },
  symbolInfo: {
    tickSize: "0.01",
    stepSize: "0.001",
    minQty: 0,
    minNotional: 0,
    maxLeverage: 50,
  },
  existingPosition: null,
  refreshAll: vi.fn().mockResolvedValue(undefined),
  setActiveSymbol: vi.fn(),
  loading: false,
  lastRefresh: null,
});

const mockTradingData = createDefaultTradingData();

type TradingWindowProps = ComponentProps<typeof TradingWindow>;
type TradingDataState = typeof mockTradingData;
type TradingDataOverrides = Omit<
  Partial<TradingDataState>,
  "accountDetails" | "symbolInfo"
> & {
  accountDetails?: Partial<TradingDataState["accountDetails"]>;
  symbolInfo?: Partial<TradingDataState["symbolInfo"]>;
};

vi.mock("@/contexts/trading-data-context", () => ({
  useTradingData: () => mockTradingData,
}));

vi.mock("./MarketDepth", () => ({
  default: () => <div data-testid="market-depth" />,
}));

vi.mock("./MultiTimeframeChart", () => ({
  default: () => <div data-testid="multi-timeframe-chart" />,
}));

vi.mock("./TradingPanelTabs", () => ({
  default: () => <div data-testid="trading-panel-tabs" />,
}));

const mockAccount = {
  _id: "acc-binance",
  accountName: "Primary Binance",
  accountType: "binance" as const,
  isActive: true,
};

const baseProps: TradingWindowProps = {
  symbol: "BTCUSDT",
  currentPrice: 20000,
  accounts: [mockAccount],
  selectedAccount: mockAccount,
  marketType: "futures" as const,
  onOrderPlaced: vi.fn(),
  onSymbolSelect: vi.fn(),
};

const postSpy = vi.spyOn(api, "post");

function resetMockTradingData(overrides: TradingDataOverrides = {}) {
  const defaults = createDefaultTradingData();

  mockTradingData.orders = overrides.orders ?? defaults.orders;
  mockTradingData.accountDetails = {
    ...defaults.accountDetails,
    ...(overrides.accountDetails ?? {}),
  };
  mockTradingData.symbolInfo = {
    ...defaults.symbolInfo,
    ...(overrides.symbolInfo ?? {}),
  };
  mockTradingData.existingPosition =
    overrides.existingPosition ?? defaults.existingPosition;
  mockTradingData.refreshAll =
    overrides.refreshAll ?? vi.fn().mockResolvedValue(undefined);
  mockTradingData.setActiveSymbol = overrides.setActiveSymbol ?? vi.fn();
  mockTradingData.loading = overrides.loading ?? defaults.loading;
  mockTradingData.lastRefresh = overrides.lastRefresh ?? defaults.lastRefresh;
}

function seedManualOrderEntry(options: { userMaxLeverage?: number } = {}) {
  localStorage.setItem("spikeyCoins_useSlTpSlider", "false");
  localStorage.setItem("spikeyCoins_defaultRiskPercent", "0");
  localStorage.removeItem("spikeyCoins_defaultTakeProfitPercent");
  localStorage.removeItem("spikeyCoins_symbolLeverages");

  if (options.userMaxLeverage != null) {
    localStorage.setItem(
      "spikeyCoins_userMaxLeverage",
      String(options.userMaxLeverage)
    );
  } else {
    localStorage.removeItem("spikeyCoins_userMaxLeverage");
  }
}

function renderTradingWindow(
  propOverrides: Partial<TradingWindowProps> = {},
  renderOptions?: Parameters<typeof renderWithProviders>[1]
) {
  return renderWithProviders(
    <TradingWindow {...baseProps} {...propOverrides} />,
    renderOptions
  );
}

async function fillManualLimitOrder(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    quantity?: string;
    price?: string;
    stopLoss?: string;
    takeProfit?: string;
  } = {}
) {
  const {
    quantity = "0.005",
    price = "20000",
    stopLoss = "19000",
    takeProfit = "",
  } = values;

  const quantityInput = screen.getByPlaceholderText("0.001") as HTMLInputElement;
  const priceInput = screen.getByPlaceholderText("20000.00") as HTMLInputElement;
  const stopLossInput = screen.getByPlaceholderText("SL Price") as HTMLInputElement;
  const takeProfitInput = screen.getByPlaceholderText("TP Price") as HTMLInputElement;

  await user.clear(quantityInput);
  if (quantity) {
    await user.type(quantityInput, quantity);
  }

  await user.clear(priceInput);
  if (price) {
    await user.type(priceInput, price);
  }

  await user.clear(stopLossInput);
  if (stopLoss) {
    await user.type(stopLossInput, stopLoss);
  }

  await user.clear(takeProfitInput);
  if (takeProfit) {
    await user.type(takeProfitInput, takeProfit);
  }

  return {
    quantityInput,
    priceInput,
    stopLossInput,
    takeProfitInput,
  };
}

describe("TradingWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postSpy.mockReset();
    localStorage.clear();
    document.body.innerHTML = "";
    resetMockTradingData();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("requires a trading account to be selected before submitting", async () => {
    const user = userEvent.setup();

    seedManualOrderEntry();
    renderTradingWindow({
      accounts: [{ ...mockAccount, _id: "" }],
      selectedAccount: undefined,
    });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText("Please select a trading account")
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("shows an error when submitting an invalid quantity", async () => {
    const user = userEvent.setup();

    seedManualOrderEntry();
    renderTradingWindow();

    const quantityInput = screen.getByPlaceholderText("0.001");
    await user.clear(quantityInput);
    await user.type(quantityInput, "0");

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText("Please enter a valid quantity")
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("requires a stop loss before submitting an order", async () => {
    const user = userEvent.setup();

    seedManualOrderEntry();
    renderTradingWindow();

    await fillManualLimitOrder(user, { stopLoss: "" });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText("Stop Loss is mandatory for risk management")
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("requires a price for limit orders", async () => {
    const user = userEvent.setup();

    seedManualOrderEntry();
    renderTradingWindow();

    await fillManualLimitOrder(user, { price: "" });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(await screen.findByText("Please enter a valid price")).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("rejects quantities below the exchange minimum", async () => {
    const user = userEvent.setup();

    resetMockTradingData({
      symbolInfo: {
        minQty: 0.01,
      },
    });
    seedManualOrderEntry();
    renderTradingWindow();

    await fillManualLimitOrder(user, { quantity: "0.005" });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText(
        "Quantity 0.005 is below minimum 0.01 for BTCUSDT. Please increase position size to at least 0.01."
      )
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("rejects orders below the minimum notional threshold", async () => {
    const user = userEvent.setup();

    resetMockTradingData({
      symbolInfo: {
        minNotional: 160,
      },
    });
    seedManualOrderEntry();
    renderTradingWindow();

    await fillManualLimitOrder(user, {
      quantity: "0.004",
      price: "20000",
    });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText(
        "Order notional value 80.00 is below minimum 160 for BTCUSDT. Required quantity: 0.008 (at price 20000.00)"
      )
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("submits a valid order, posts the expected payload, and resets the form", async () => {
    const user = userEvent.setup();
    const onOrderPlaced = vi.fn();

    postSpy.mockResolvedValueOnce({
      data: {
        success: true,
      },
    });

    seedManualOrderEntry();
    renderTradingWindow({ onOrderPlaced });

    const { quantityInput, priceInput, stopLossInput, takeProfitInput } =
      await fillManualLimitOrder(user, {
        quantity: "0.005",
        price: "20010",
        stopLoss: "19000",
        takeProfit: "21000",
      });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText("BUY order placed successfully for 0.005 BTCUSDT")
    ).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledWith("/orders/place", {
      accountId: mockAccount._id,
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.005,
      price: 20010,
      reduceOnly: false,
      leverage: 20,
      stopLoss: 19000,
      takeProfit: 21000,
    });
    expect(onOrderPlaced).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(quantityInput.value).toBe("0.001");
      expect(priceInput.value).toBe("20000");
      expect(stopLossInput.value).toBe("");
      expect(takeProfitInput.value).toBe("");
    });
  });

  it("preserves retry state for SL/TP warnings and retries failed orders", async () => {
    const user = userEvent.setup();

    postSpy
      .mockResolvedValueOnce({
        data: {
          success: true,
          warnings: [
            { type: "sl_failed", message: "SL leg failed" },
            { type: "tp_failed", message: "TP leg failed" },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: true } });

    seedManualOrderEntry();
    renderTradingWindow();

    const { quantityInput } = await fillManualLimitOrder(user, {
      quantity: "0.005",
      price: "20000",
      stopLoss: "19000",
      takeProfit: "21000",
    });

    await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

    expect(
      await screen.findByText(
        "BUY order placed successfully for 0.005 BTCUSDT ⚠️ Warning: SL leg failed; TP leg failed"
      )
    ).toBeInTheDocument();
    expect(await screen.findByText("SL/TP Warning: SL leg failed; TP leg failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry sl\/tp orders/i })).toBeInTheDocument();
    expect(quantityInput.value).toBe("0.005");

    await user.click(screen.getByRole("button", { name: /retry sl\/tp orders/i }));

    expect(await screen.findByText("Successfully retried: SL, TP")).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledTimes(3);
    expect(postSpy.mock.calls[1]).toEqual([
      "/orders/place",
      {
        accountId: mockAccount._id,
        symbol: "BTCUSDT",
        side: "SELL",
        type: "STOP_MARKET",
        stopPrice: 19000,
        quantity: 0.005,
        reduceOnly: true,
        closePosition: undefined,
      },
    ]);
    expect(postSpy.mock.calls[2]).toEqual([
      "/orders/place",
      {
        accountId: mockAccount._id,
        symbol: "BTCUSDT",
        side: "SELL",
        type: "TAKE_PROFIT_MARKET",
        stopPrice: 21000,
        quantity: 0.005,
        reduceOnly: true,
        closePosition: undefined,
      },
    ]);

    await waitFor(() => {
      expect(quantityInput.value).toBe("0.001");
    });
    expect(
      screen.queryByRole("button", { name: /retry sl\/tp orders/i })
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "response details",
      { response: { data: { details: "Detailed failure" } }, message: "fallback" },
      "Detailed failure",
    ],
    [
      "response error",
      { response: { data: { error: "Generic server error" } }, message: "fallback" },
      "Generic server error",
    ],
    ["plain error message", { message: "Network down" }, "Network down"],
  ])(
    "shows the best available API error from the %s branch",
    async (_label, rejection, expectedMessage) => {
      const user = userEvent.setup();

      postSpy.mockRejectedValueOnce(rejection);

      seedManualOrderEntry();
      renderTradingWindow();

      await fillManualLimitOrder(user, {
        quantity: "0.005",
        price: "20000",
        stopLoss: "19000",
      });

      await user.click(screen.getByRole("button", { name: /buy btcusdt/i }));

      expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    }
  );

  it("blocks signed-out demo trading in the UI and prevents submission", async () => {
    const user = userEvent.setup();
    const demoAccount = {
      ...mockAccount,
      _id: "acc-demo",
      accountName: "Demo Binance",
      isDemo: true,
    };

    seedManualOrderEntry();
    renderTradingWindow(
      {
        accounts: [demoAccount],
        selectedAccount: demoAccount,
      },
      {
        authState: {
          isLoggedIn: false,
        },
      }
    );

    const button = screen.getByRole("button", { name: /sign in to trade/i });
    expect(button).toBeDisabled();
    expect(
      screen.getByText("Sign in to enable demo trading with testnet funds")
    ).toBeInTheDocument();

    await user.click(button);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("renders form fields from updated trading context snapshots", async () => {
    seedManualOrderEntry();
    const view = renderTradingWindow();

    expect(screen.getByPlaceholderText("20000.00")).toHaveAttribute("step", "0.01");

    view.unmount();
    resetMockTradingData({
      accountDetails: {
        equity: 2500,
        availableBalance: 2500,
      },
      symbolInfo: {
        tickSize: "0.10",
        minQty: 0.01,
        minNotional: 50,
        maxLeverage: 25,
      },
    });
    renderTradingWindow();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("20000.00")).toHaveAttribute("step", "0.10");
      expect(screen.getByText("Min qty: 0.01")).toBeInTheDocument();
      expect(
        screen.getByText("Min notional: $50 (at 20000.00 price)")
      ).toBeInTheDocument();
      expect(screen.getAllByText("$2500.00").length).toBeGreaterThan(0);
    });
  });

  it("caps the leverage slider using the persisted user maximum", async () => {
    seedManualOrderEntry({ userMaxLeverage: 7 });
    renderTradingWindow();

    const sliders = screen.getAllByRole("slider");
    const leverageSlider = sliders[sliders.length - 1];

    await waitFor(() => {
      expect(leverageSlider).toHaveAttribute("aria-valuemax", "7");
      expect(leverageSlider).toHaveAttribute("aria-valuenow", "7");
    });
  });
});