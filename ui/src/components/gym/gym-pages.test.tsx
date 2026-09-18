import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GymPage from "@/app/(routes)/gym/page";
import DrillsPage from "@/app/(routes)/gym/drills/page";
import api from "@/lib/api";
import { GymCandle, GymSession } from "./types";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("./gym-chart", () => ({
  GymChart: ({ candles }: { candles: GymCandle[] }) => <div role="img" aria-label={`Chart with ${candles.length} candles`} />,
}));

const candle: GymCandle = { open: 100, high: 102, low: 98, close: 100, volume: 1, timestamp: 0 };
const fixture = (): GymSession => ({
  id: "session", schemaVersion: 2, mode: "FREE", interval: "15m", currentCandleIndex: 1,
  totalCandles: 100, candles: [candle], trades: [], totalPnl: 0, totalPnlCash: 0, totalR: 0,
  startingCapital: 100000, capital: 100000, status: "ACTIVE",
});

beforeEach(() => { vi.mocked(api.get).mockReset(); vi.mocked(api.post).mockReset(); });

describe("Gym page integration", () => {
  it.each([1, 2])("allows a FREE v%s session to place a market order and a short limit order", async (schemaVersion) => {
    const user = userEvent.setup();
    const session = { ...fixture(), schemaVersion };
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, session } });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, session } });
    render(<GymPage />);
    await screen.findByRole("heading", { name: "Free Sandbox Order Entry" });
    expect(api.get).toHaveBeenCalledWith("/gym/session/active");
    await user.type(screen.getByLabelText("Stop loss"), "95");
    await user.type(screen.getByLabelText("Take profit"), "110");
    await user.click(screen.getByRole("button", { name: "Place LONG MARKET Order" }));
    expect(api.post).toHaveBeenCalledWith("/gym/session/session/trade", {
      side: "LONG", type: "MARKET", stopLoss: 95, takeProfit: 110,
    });
    await user.selectOptions(screen.getByLabelText("Side"), "SHORT");
    await user.selectOptions(screen.getByLabelText("Order type"), "LIMIT");
    await user.clear(screen.getByLabelText("Limit price"));
    await user.type(screen.getByLabelText("Limit price"), "105");
    await user.clear(screen.getByLabelText("Stop loss"));
    await user.type(screen.getByLabelText("Stop loss"), "110");
    await user.clear(screen.getByLabelText("Take profit"));
    await user.type(screen.getByLabelText("Take profit"), "95");
    await user.click(screen.getByRole("button", { name: "Place SHORT LIMIT Order" }));
    expect(api.post).toHaveBeenLastCalledWith("/gym/session/session/trade", {
      side: "SHORT", type: "LIMIT", limitPrice: 105, stopLoss: 110, takeProfit: 95,
    });
  });

  it("renders the score delivered by reveal instead of claiming zero trades", async () => {
    const user = userEvent.setup();
    const session = fixture();
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, session } });
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, session: {
      ...session, mode: "METHOD", status: "REVEALED", actualSymbol: "BTCUSDT",
      scorecard: { version: "1.0.0", processScore: 85, components: {}, methodologyVersion: "1.0.0", evaluatedAt: new Date().toISOString() },
    } } });
    render(<GymPage />);
    await user.click(await screen.findByRole("button", { name: "Reveal & End" }));
    await screen.findByRole("heading", { name: "Session Reveal & Scorecard" });
    expect(screen.getByText("85")).toBeVisible();
    expect(screen.queryByText("Not Scored (0 Trades Executed)")).not.toBeInTheDocument();
  });
});

describe("Alignment drill integration", () => {
  it.each([
    ["CHOP_NO_TRADE", "No Trade: Chop / No Clear Alignment"],
    ["COUNTER_TREND_NO_TRADE", "No Trade: Lower Timeframe Against Higher Trend"],
  ])("shows all three charts and allows submitting %s", async (code, label) => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true, drill: {
      id: "drill", drillType: "ALIGNMENT", status: "ACTIVE", candles: [candle],
      higherCandles: [candle, candle], lowerCandles: [candle, candle, candle],
    } } }).mockResolvedValueOnce({ data: { success: true, drill: {
      id: "drill", drillType: "ALIGNMENT", status: "SUBMITTED", score: 100, metrics: { isCorrect: true, expected: code },
    } } });
    render(<DrillsPage />);
    await user.click(screen.getByRole("button", { name: "MTF Alignment" }));
    const higher = await screen.findByRole("region", { name: "Higher timeframe" });
    expect(within(higher).getByRole("img", { name: "Chart with 2 candles" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Lower timeframe" })).getByRole("img", { name: "Chart with 3 candles" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: label }));
    await user.click(screen.getByRole("button", { name: "Submit Answer" }));
    expect(api.post).toHaveBeenLastCalledWith("/gym/drills/drill/submit", { submission: { code } });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Drill Scorecard" })).toBeVisible());
    expect(screen.getByRole("img", { name: "Chart with 2 candles" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Chart with 1 candles" })).toBeVisible();
  });
});
