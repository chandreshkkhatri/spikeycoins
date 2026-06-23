# Plan: Backend Testing Setup — Vitest + first service test (BG-016, enables BG-014)

## Context

The frontend has a working Vitest/RTL suite (iterations 1–3); the `web-server` has **no test runner at all**. This sprint stands up Vitest for the backend and writes the first high-value test: `binance-futures-order.service.ts`, the order-placement orchestrator extracted during the refactor sprints. It's the highest-risk backend code (the money path) and was recently AI-refactored, so it's the right first target.

Split out of the frontend testing sprint ([sprint-0-frontend-testing-iteration-3.md](sprint-0-frontend-testing-iteration-3.md)) because it needs its own `web-server` Vitest config and uses **dependency-injected mocking, not MSW** — `placeFuturesOrderWithRisk(binanceService, params)` takes its `BinanceService` as a parameter, so tests just pass a mock object; no network layer required.

Once this Vitest config exists, **BG-014** (backend unit tests for `format-utils` and `BrokerFactory`) becomes a cheap follow-up on the same infrastructure.

### Grounding facts (verified against source)
- The service exports exactly three symbols: `roundToPrecision`, `validateStopPrice` (pure), and `placeFuturesOrderWithRisk` (orchestrator). All three are directly importable — no DI gymnastics needed.
- Backend is **CommonJS** (`tsconfig`: `module: commonjs`, `target: ES2020`), unlike the ESM frontend. Vitest runs both fine via esbuild, but the config is separate from the frontend's.
- A `@/*` → `src/*` path alias exists in the backend `tsconfig`. The service itself uses relative imports, but the Vitest config should resolve `@/*` anyway so future tests (and BG-014) aren't blocked.
- Importing the service module transitively loads `binance-service.ts` → `binance-client-base.ts`, which constructs a Bottleneck limiter and axios instances at module load. This is **harmless in node** (no network call until a method runs) — and since tests pass a *mock* `BinanceService`, the real one is never instantiated. No special handling needed.
- `lint` is `eslint src --ext .ts` (eslint v8), so any test file placed under `src/` is linted automatically. The existing backend lint baseline already carries unrelated warnings/errors — the gate is "no *new* problems," not zero.

---

## Setup

### 1. Dependencies (`web-server`)
- `vitest` (dev). No jsdom, no RTL — node-only.

### 2. `web-server/vitest.config.ts`
- `test.environment: "node"`.
- `test.globals: true`, but keep **explicit `import { describe, it, expect, vi } from "vitest"`** in test files to match the frontend convention (consistency across the repo; also keeps types working without touching `tsconfig`).
- `resolve.alias`: `"@"` → `path.resolve(__dirname, "./src")` (mirror the tsconfig alias).

### 3. `web-server/package.json`
- `"test": "vitest run"`, `"test:watch": "vitest"`.

### 4. Test file location
- Co-locate next to source: `src/lib/binance-futures-order.service.test.ts` (matches the frontend's co-location convention from iteration 2).

---

## Test — `binance-futures-order.service.test.ts`

No MSW. Build a typed mock `BinanceService`: an object whose methods are `vi.fn()` —
`getFuturesExchangeInfo`, `changeFuturesLeverage`, `getFuturesMarkPrice`, `placeFuturesOrder`, `placeFuturesAlgoOrder`, `cancelFuturesSlTpOrders` — cast to the param type (`as unknown as BinanceService`). Assert on both return values **and the args** passed to those mocks. A small factory (`makeMockService(overrides)`) returning a fresh mock with sensible default `exchangeInfo` (precision/filters) keeps each test readable.

**Pure helpers:**
- `roundToPrecision` — precision rounding; stepSize snapping (e.g. value `0.137`, step `0.01` → `0.14`); stepSize `0` passthrough.
- `validateStopPrice` — the four core cases: SL below mark for LONG (valid) / above (invalid); TP above mark for LONG (valid) / below (invalid); plus the SHORT-side mirror for at least one.

**Orchestration (`placeFuturesOrderWithRisk`), with a mocked `getFuturesExchangeInfo` supplying precision + LOT_SIZE/MIN_NOTIONAL filters:**
- Min-qty rejection: quantity that rounds below `minQty` throws the expected error; `placeFuturesOrder` is **not** called.
- Min-notional rejection: for a MARKET order it fetches `getFuturesMarkPrice` for the notional calc, and throws when `qty * price < minNotional`.
- Leverage: `changeFuturesLeverage` rejecting with `"No need to change"` is swallowed (order still placed); a hard leverage error (e.g. "exceeds maximum") throws with the actionable message.
- Entry routing: a `LIMIT`/`MARKET` type → `placeFuturesOrder`; a conditional type (`STOP_MARKET` etc.) → `placeFuturesAlgoOrder`.
- SL/TP placement: opposite side of entry; **LIMIT entry uses quantity-based `reduceOnly`**, non-LIMIT uses `closePosition: true` — assert which path each took.
- SL/TP error capture: when the place call for the SL/TP rejects on every retry, `slError`/`tpError` is populated in the return while the main `order` still succeeds.
- Returned `roundedQuantity` reflects the precision/step rounding.

---

## Verification

1. `cd web-server && npm run test` — passes.
2. `npm run type-check` — clean, incl. the new test file.
3. `npm run lint` — **no new** problems over the existing baseline (capture the baseline count first, compare after).
4. **Mutation sanity:** swap the `reduceOnly`/`closePosition` selection (or flip the SL/TP side) in the service and confirm the relevant test fails; then revert. Proves the test pins real behavior, not just "runs."

## Notes

- Production code stays untouched — this sprint only adds config + a test. The service is already dependency-injectable, so no refactor is needed.
- **BG-014** (`format-utils` + `BrokerFactory` backend tests) is the natural next sprint on this same Vitest config — out of scope here, but unblocked by it.
- No DB or network access — everything injected/mocked.
- Frontend conventions carried over: co-located test files, explicit Vitest imports, no snapshots, a mutation check in verification.
