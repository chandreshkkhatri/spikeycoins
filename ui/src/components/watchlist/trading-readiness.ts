export const FUNDS_MAX_AGE_MS = 90_000;

export interface TradingReadiness {
  accountId?: string;
  symbol: string;
  authenticated: boolean;
  loading: boolean;
  error?: string | null;
  scope?: { accountId: string; symbol: string; asOf: number } | null;
  funds: number | undefined;
  rules?: {
    verified?: boolean;
    tickSize: string;
    stepSize: string;
    minQty: number;
    minNotional: number;
    maxLeverage: number;
  };
}

export function tradingReadinessReason(input: TradingReadiness, now: number): string | null {
  if (!input.authenticated) return "Sign in to trade.";
  if (!input.accountId) return "Select a trading account.";
  if (input.loading) return "Refreshing account funds and symbol rules…";
  if (input.error) return "Account data could not be refreshed. Refresh before trading.";
  if (!input.scope || input.scope.accountId !== input.accountId || input.scope.symbol !== input.symbol) {
    return "Waiting for verified funds and rules for this account and symbol.";
  }
  if (!Number.isFinite(input.scope.asOf) || input.scope.asOf <= 0 ||
      now - input.scope.asOf >= FUNDS_MAX_AGE_MS || input.scope.asOf > now) {
    return "Account data is stale. Refresh before trading.";
  }
  if (typeof input.funds !== "number" || !Number.isFinite(input.funds) || input.funds < 0) {
    return "Available funds are unavailable. Refresh before trading.";
  }
  const rules = input.rules;
  if (!rules?.verified || !Number.isFinite(Number(rules.tickSize)) || Number(rules.tickSize) <= 0 ||
      !Number.isFinite(Number(rules.stepSize)) || Number(rules.stepSize) <= 0 ||
      !Number.isFinite(rules.minQty) || rules.minQty < 0 ||
      !Number.isFinite(rules.minNotional) || rules.minNotional < 0 ||
      !Number.isFinite(rules.maxLeverage) || rules.maxLeverage <= 0) {
    return "Verified symbol rules are unavailable. Trading is disabled for this instrument.";
  }
  return null;
}
