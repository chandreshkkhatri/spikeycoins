# Plan: Refactor Iteration 2 — order-placement service extraction + frontend card-helper dedup

## Context

Iteration 1 made the broker clients safe and de-duplicated the order monitor. Iteration 2 tackles the two biggest remaining "god" hotspots surfaced in the audit, one backend and one frontend:

1. **`orders.ts` `POST /place` is a ~540-line god-handler** (lines 106–674 of a 776-line file). The Binance-futures branch inlines all orchestration — precision rounding, leverage setting, min-qty/min-notional validation, conditional-order routing, and the entry + SL/TP placement-with-retry flow — even though every *low-level* Binance call it needs already exists on `BinanceService` (`placeFuturesOrder`, `placeFuturesAlgoOrder`, `changeFuturesLeverage`, `getFuturesExchangeInfo`, `getFuturesMarkPrice`, `cancelFuturesSlTpOrders`). The route mixes HTTP concerns with trading logic, is impossible to unit-test, and can't be reused (e.g. by automation/cron). Extract the orchestration into a service so the route becomes thin.

2. **The four trading cards duplicate the same helpers.** `getVendorColor` is copy-pasted in [OrdersCard.tsx](ui/src/components/orders/OrdersCard.tsx), [FundsCard.tsx](ui/src/components/funds/FundsCard.tsx), [HoldingsCard.tsx](ui/src/components/holdings/HoldingsCard.tsx), [PositionsCard.tsx](ui/src/components/positions/PositionsCard.tsx); `formatCurrency` is duplicated 4× too (3 identical `₹{n}` numeric versions + 1 vendor-aware version in FundsCard). There is already a shared [format-utils.ts](ui/src/lib/format-utils.ts) (`formatPrice`, `formatPercent`, …) — these belong there.

Item 1 is the high-risk, high-value money path; item 2 is a safe, mechanical companion (mirrors iteration 1's "one heavy + one light" shape).

---

## Refactor 1 — Extract Binance order placement into a service

**New file:** `web-server/src/lib/binance-futures-order.service.ts` (a thin orchestration layer over `BinanceService`; keep `BinanceService` itself as the SDK wrapper — do not grow the 1200-line class).

Move these out of the `orders.ts` `/place` handler:

- **Pure helpers** (currently inline closures in the handler) → module-level, exported, unit-testable:
  - `roundToPrecision(value, precision, stepSize)` (orders.ts ~line 200)
  - `validateStopPrice(stopPrice, markPrice, side, orderType)` (~line 410)
- **Orchestrator:** `placeFuturesOrderWithRisk(service: BinanceService, params): Promise<{ order: any; slError: string | null; tpError: string | null }>` containing, in order, the exact current logic:
  1. fetch `getFuturesExchangeInfo()` → derive `quantityPrecision`, `pricePrecision`, `stepSize`, `minQty`, `minNotional`
  2. round quantity/price/stopPrice; enforce `minQty` and `minNotional` (fetching `getFuturesMarkPrice` for MARKET orders) — preserve the existing thrown error messages verbatim
  3. `changeFuturesLeverage()` with the current "No need to change"/"exceeds maximum" handling
  4. place entry order: route conditional types to `placeFuturesAlgoOrder`, else `placeFuturesOrder`
  5. cancel existing SL/TP via `cancelFuturesSlTpOrders`, then place SL and TP through the existing `placeSLTPWithRetry` logic (retry/backoff) using quantity-based vs `closePosition` based on order type
  6. return `{ order, slError, tpError }` (do **not** send push notifications or build HTTP responses here)

**Route change ([orders.ts](web-server/src/routes/orders.ts) `/place`):** the Binance-futures branch becomes ~15 lines — assemble params from `req.body`, call `placeFuturesOrderWithRisk(binanceService, params)`, then keep the **existing** push-notification dispatch and `warnings[]` response shaping in the route (they need `account.userId`/HTTP context). The Upstox branch is unchanged.

**Spot path (optional, same file for symmetry):** extract a small `placeSpotOrderValidated(service, params)` wrapping the current spot validation + `placeSpotOrder`. Lower priority; include only if it stays trivial.

**Outcome:** `orders.ts` drops from ~776 → ~250 lines; order-placement logic becomes reusable and testable; zero behavior change.

---

## Refactor 2 — Consolidate frontend card helpers

- **Add to [ui/src/lib/format-utils.ts](ui/src/lib/format-utils.ts):**
  - `getVendorColor(vendor: string): string` — the identical `upstox → #387ed1`, `binance → #f3ba2f`, default switch. **Pure dedup, zero behavior change.**
  - `formatBrokerAmount(amount, vendor)` — vendor-aware currency (`$` for `binance`, `₹` otherwise), matching FundsCard's existing vendor-aware `formatCurrency`.
- **Migrate** [OrdersCard.tsx](ui/src/components/orders/OrdersCard.tsx), [FundsCard.tsx](ui/src/components/funds/FundsCard.tsx), [HoldingsCard.tsx](ui/src/components/holdings/HoldingsCard.tsx), [PositionsCard.tsx](ui/src/components/positions/PositionsCard.tsx) to import these and delete their local copies.

> **⚠️ Behavior-change callout:** Orders/Holdings/Positions currently hard-code `₹` even for Binance accounts; moving them to `formatBrokerAmount` makes Binance amounts render `$`. This is almost certainly a latent-bug fix, but it IS a visible change — confirm it's wanted. If a pure no-behavior-change refactor is preferred, keep a `formatInrAmount` for those three and only unify `getVendorColor`.

---

## Verification

1. **Backend type-check + build:** `cd web-server && npm run type-check && npm run build` — clean.
2. **Frontend type-check:** `cd ui && npx tsc --noEmit` — clean.
3. **Lint baseline:** `cd web-server && npm run lint` — error count not above the current baseline (16); ideally lower as inline `any` closures move into typed helpers.
4. **Grep gates:**
   - `grep -n "placeFuturesOrderWithRisk" web-server/src/routes/orders.ts web-server/src/lib/binance-futures-order.service.ts` → present in both.
   - `grep -rc "const getVendorColor" ui/src/components` → 0 (all moved to the shared util).
5. **Runtime smoke (testnet — this is the live order path, test carefully):**
   - Place a Binance **futures LIMIT** order with both SL and TP → confirm entry + both conditional orders appear, leverage applied, and quantities/prices rounded exactly as before.
   - Place a **MARKET** order below min-notional → confirm the same rejection error message as today.
   - Trigger SL → confirm TP auto-cancels (interaction with the iteration-1 order monitor still works).
   - Place a Binance **spot** order and an **Upstox** order → confirm both unaffected.
   - Load all four cards for an Upstox account and a Binance account → confirm colors and amounts render correctly (note the `$`/`₹` change above).

## Notes
- Refactor 1 is behavior-preserving on the backend: copy the logic and error strings verbatim, only relocating them. Do it in small commits (helpers → orchestrator → route swap) so each step type-checks.
- No new dependencies. No DB changes.
- Deferred to a later iteration: splitting the 1200-line `binance-service.ts` into spot/futures/market-data modules, the duplicated `format-utils` across `ui/` and `web-server/`, and the `Watchlist.tsx` (1257-line) component. Also outstanding from the audit (non-refactor, security): AES-GCM + fail-fast secrets, CORS `*.vercel.app`, and auth-route ownership checks — track these separately.
