# Plan: Backend Testing Setup — Vitest + first service/unit tests (BG-016, enables BG-014)

## Context

The frontend has a working Vitest/RTL suite (iterations 1–3); the `web-server` has **no test runner at all**. This sprint stands up Vitest for the backend and writes the first high-value test: `binance-futures-order.service.ts`, the order-placement orchestrator extracted during the refactor sprints. It's the highest-risk backend code (the money path) and was recently AI-refactored, so it's the right first target.

Split out of the frontend testing sprint ([sprint-0-frontend-testing-iteration-3.md](sprint-0-frontend-testing-iteration-3.md)) because it needs its own `web-server` Vitest config and uses **dependency-injected mocking, not MSW** — `placeFuturesOrderWithRisk(binanceService, params)` takes its `BinanceService` as a parameter, so tests just pass a mock object; no network layer required.

Once this Vitest config exists, **BG-014** (backend unit tests for `format-utils` and `BrokerFactory`) becomes a cheap follow-up on the same infrastructure.

---

## Setup

### 1. Dependencies (`web-server`)
- `vitest` (dev). No jsdom, no RTL — backend is node-only.

### 2. `web-server/vitest.config.ts`
- `environment: "node"`.
- `globals: true` (or keep explicit imports — match whatever the frontend convention settled on for consistency).
- Resolve any path alias the backend `tsconfig.json` uses, if present.

### 3. `web-server/package.json`
- `"test": "vitest run"`, `"test:watch": "vitest"`.

### 4. Sanity
- A trivial passing test (or go straight to the service test below) to confirm the runner executes TS + the config resolves.

---

## First test — `binance-futures-order.service.test.ts`

No MSW. Pass a hand-rolled mock `BinanceService`: an object with `vi.fn()` methods — `getFuturesExchangeInfo`, `changeFuturesLeverage`, `getFuturesMarkPrice`, `placeFuturesOrder`, `placeFuturesAlgoOrder`, `cancelFuturesSlTpOrders`. Assert on both return values and the **args** passed to those mocks.

**Pure helpers (exported):**
- `roundToPrecision` — stepSize snapping and precision rounding.
- `validateStopPrice` — the four valid/invalid cases (SL/TP × LONG/SHORT vs. mark price).

**Orchestration (`placeFuturesOrderWithRisk`):**
- Min-qty rejection (rounded quantity below `minQty` throws).
- Min-notional rejection, including the MARKET-order path that fetches mark price for notional validation.
- Leverage: `"No need to change"` is a no-op (proceeds); a hard leverage failure throws with the actionable message.
- Entry routing: non-conditional type → `placeFuturesOrder`; conditional type (STOP/TP variants) → `placeFuturesAlgoOrder`.
- SL/TP: placed with the **opposite** side of the entry; `reduceOnly` vs `closePosition` chosen correctly by order type (quantity-based for LIMIT, closePosition otherwise).
- `slError` / `tpError` populated when the retry helper exhausts its attempts (mock the place call to reject).

---

## Verification

1. `cd web-server && npm run test` — passes.
2. `npm run type-check` (or `tsc --noEmit`) — clean, incl. the new test file.
3. `npx eslint` on the new files — no new errors over the existing baseline.
4. **Mutation sanity:** swap `reduceOnly`/`closePosition` selection (or the SL/TP side) in the service and confirm the test fails — proves it pins real behavior.

## Notes

- Keep the service logic untouched — this sprint only adds tests + config. It's already dependency-injectable, so no production changes are needed.
- **BG-014** (`format-utils` + `BrokerFactory` backend tests) is the natural next sprint on this same Vitest config — out of scope here, but this unblocks it.
- No DB or network access in these tests — everything is injected/mocked.
