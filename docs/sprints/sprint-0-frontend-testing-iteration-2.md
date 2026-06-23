# Plan: Frontend Testing Iteration 2 — pure-utility & leaf-component coverage

## Context

The setup sprint ([sprint-0-frontend-testing-setup.md](sprint-0-frontend-testing-setup.md)) got Vitest + RTL wired up and proved it works with one dummy test. There is still zero real coverage.

The highest-value next tests — `useWatchlist.ts`, the trading cards, the order-placement service — all need API mocking (MSW) and a provider-aware `render` wrapper (`AuthContext`/`AccountContext`) before they're testable; that's deliberately deferred to **BG-015** in the backlog.

This iteration covers the layer underneath that needs no mocking at all: pure functions and dependency-free presentational components. It's intentionally small and mechanical — the goal is to bank real, durable coverage on code that's already had bugs (the Binance `$`/₹ formatting fix from iteration 2 of the refactor work lived in exactly this layer) and to establish the test-file conventions (naming, `describe`/`it` structure, assertion style) the BG-015 work will follow.

---

## Scope

### 1. `ui/src/lib/format-utils.ts` — `format-utils.test.ts`
Pure functions, no DOM/context dependency:
- `calculatePriceDecimals` — boundary values at each magnitude threshold (0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000).
- `formatPrice` — null/undefined/NaN → `"0.00"`; zero; comma-insertion above 1000; symbol prefix.
- `formatVolume` — K/M/B suffix thresholds; null/NaN/zero.
- `formatPercent` — sign inclusion on positive/negative/zero; `includeSign=false`.
- `formatQuantity` — the four bucketed precision tiers (≥1000, ≥1, ≥0.0001, below).
- `getVendorColor` — `"binance"`, `"upstox"`, unknown vendor fallback, case-insensitivity.
- `formatBrokerAmount` — `$` for binance vs `₹` for everything else, string vs number input, null/undefined/NaN handling. This is the function with the most recent real behavior change (iteration 2 of the refactor sprints) — pin it down.

### 2. `ui/src/lib/number-utils.ts` — `number-utils.test.ts`
- `toSafeNumber` — valid number, numeric string, null/undefined, non-numeric string, `Infinity`, custom fallback.
- `isValidNumber` — type-guard narrowing on number/string/NaN/Infinity/null.

### 3. Leaf presentational components (no API calls, no context)
- `LoadingSpinner.tsx` — renders with/without a `message` prop.
- `badge.tsx` — renders children, applies variant classes.
- `button.tsx` — renders children, fires `onClick`, respects `disabled`.

These are chosen specifically because they import nothing from `@/contexts/*` or `@/lib/api` — confirmed via grep before writing tests, so this iteration stays mock-free.

---

## Out of scope (tracked separately)

- Anything importing `AuthContext`, `AccountContext`, or `@/lib/api` (Orders/Funds/Holdings/Positions cards, `useWatchlist`, `AccountSelector`, etc.) — **BG-015**.
- Backend Vitest coverage for `format-utils.ts` (web-server) and `BrokerFactory` — already tracked as **BG-014**.
- Snapshot/visual regression testing — not adopted; assertion-based RTL queries only, to avoid brittle snapshots that AI-driven changes would constantly need to re-approve blindly.

---

## Verification

1. `cd ui && npm run test` — all new test files pass alongside the existing sample test.
2. `npx tsc --noEmit` — no type errors in new test files.
3. `npx eslint src/lib/format-utils.test.ts src/lib/number-utils.test.ts src/components/ui/*.test.tsx` — clean.
4. Sanity check: temporarily reintroduce the old `₹`-only bug in `formatBrokerAmount` and confirm the test suite fails — proves the tests actually assert behavior, not just "renders without crashing."

## Notes

- Co-locate test files next to their source (`format-utils.test.ts` beside `format-utils.ts`) rather than under `src/__tests__/`, which is reserved for the global `setup.ts`. `sample.test.tsx` can move or be deleted once real coverage exists — it was only a wiring smoke test.
- No new dependencies needed for this iteration.
- Next iteration after this one is BG-015 (MSW + provider-aware render + hook/card/service tests).
