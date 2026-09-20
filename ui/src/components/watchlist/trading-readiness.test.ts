import { describe, expect, it } from "vitest";
import { tradingReadinessReason, type TradingReadiness, FUNDS_MAX_AGE_MS } from "./trading-readiness";

const now = 1000000;
const ready: TradingReadiness = {
  accountId: "a", symbol: "BTCUSDT", authenticated: true, loading: false,
  scope: { accountId: "a", symbol: "BTCUSDT", asOf: now },
  funds: 1000,
  rules: { verified: true, tickSize: "0.01", stepSize: "0.001", minQty: 0.001, minNotional: 5, maxLeverage: 20 },
};
describe("trading readiness", () => {
  it("distinguishes genuine zero funds from absent or invalid funds", () => {
    expect(tradingReadinessReason({ ...ready, funds: 0 }, now)).toBeNull();
    for (const funds of [undefined, NaN, Infinity, -1]) {
      expect(tradingReadinessReason({ ...ready, funds }, now)).toContain("funds are unavailable");
    }
  });
  it("rejects missing and mismatched provenance", () => {
    for (const scope of [null, { ...ready.scope!, accountId: "b" }, { ...ready.scope!, symbol: "ETHUSDT" }]) {
      expect(tradingReadinessReason({ ...ready, scope }, now)).toContain("Waiting for verified");
    }
  });
  it("expires source time, including cached data and future timestamps", () => {
    for (const asOf of [0, NaN, now - FUNDS_MAX_AGE_MS, now + 1000]) {
      expect(tradingReadinessReason({ ...ready, scope: { ...ready.scope!, asOf } }, now)).toContain("stale");
    }
  });
  it("does not trust defaults or malformed exchange filters", () => {
    for (const rules of [
      { ...ready.rules!, verified: false },
      { ...ready.rules!, tickSize: "NaN" },
      { ...ready.rules!, stepSize: "0" },
      { ...ready.rules!, minQty: NaN },
    ]) expect(tradingReadinessReason({ ...ready, rules }, now)).toContain("symbol rules");
  });
  it("blocks while refreshing, unauthenticated, or after a refresh error", () => {
    expect(tradingReadinessReason({ ...ready, loading: true }, now)).toContain("Refreshing");
    expect(tradingReadinessReason({ ...ready, authenticated: false }, now)).toContain("Sign in");
    expect(tradingReadinessReason({ ...ready, error: "failed" }, now)).toContain("could not be refreshed");
  });
});
