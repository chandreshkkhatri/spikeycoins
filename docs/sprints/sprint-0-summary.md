# Sprint-0 Consolidated Summary

This document consolidates and summarizes the planning, execution, and closeout outcomes of **Sprint-0 ("Foundation")**. Sprint-0 focused on two parallel tracks: paying down architectural technical debt through systematic refactoring and establishing a modern testing foundation from scratch.

---

## 1. Refactoring Track Summary

The refactoring track paid down key architectural debt identified in the codebase audit, moving towards isolated, testable, and modular code structures.

### Kite/Zerodha Removal
- **Scope:** Stripped the unused Kite/Zerodha broker integration across backend routes, database models, auth handlers, frontend components, TypeScript types, and npm dependencies.
- **Database migration:** Created a reversible DB migration script `scripts/deactivate-kite-accounts.ts` to deactivate existing Kite accounts.

### Iteration 1 — Upstox Client Per-Request & Order Monitor De-duplication
- **Upstox Per-Request Client:** Converted the Upstox client service ([upstox-service.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/upstox-service.ts)) from a shared mutable global singleton into a clean class instantiated per request. This resolved a concurrent credential clobbering race condition.
- **Order Monitor De-duplication:** Modified the `binance-order-monitor.ts` to delegate REST API requests and order operations to `BinanceService` instead of maintaining redundant, hand-rolled HTTP/signing clients. This removed ~200 lines of duplicate code.

### Iteration 2 — Binance Futures Order Placement Service & UI Card Helpers
- **Service Extraction:** Extracted the ~540-line god-handler inside the `/place` route of `orders.ts` into a dedicated, unit-testable orchestrator service ([binance-futures-order.service.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/binance-futures-order.service.ts)). This handles quantity precision rounding, leverage setting, `MIN_NOTIONAL` validation, and retry/backoff for Stop Loss (SL) and Take Profit (TP) companion orders.
- **UI Helper Consolidation:** Consolidated four duplicated UI card helpers (`getVendorColor` and `formatBrokerAmount`) into [format-utils.ts](file:///home/ubuntu/code/spikeycoins/ui/src/lib/format-utils.ts), resolving a latent bug where currency symbols (`$` vs `₹`) were hardcoded incorrectly for Binance/Upstox vendors.

### Iteration 3 — BinanceService Modularization & Watchlist Hook Extraction
- **Binance SDK Facade:** Modularized the 1262-line `binance-service.ts` into a clean base class (`BinanceClientBase`) and two sub-services (`BinanceSpotService`, `BinanceFuturesService`), retaining 100% backward-compatibility via a facade wrapper.
- **Watchlist State Hook:** Extracted the state management, WebSocket subscription throttling, filtering, and sorting logic from the 1258-line `Watchlist.tsx` component into a reusable React hook ([useWatchlist.ts](file:///home/ubuntu/code/spikeycoins/ui/src/components/watchlist/useWatchlist.ts)), leaving the component as a thin visual presentation shell.

---

## 2. Testing Track Summary

A comprehensive, zero-dependency testing foundation was stood up for both the Next.js frontend and the Express backend.

### Frontend Testing Setup & Iterations
- **Vitest & RTL Setup:** Set up Vitest, React Testing Library, and `jsdom` for the `ui` project.
- **Leaf-Component & Utility Coverage:** Implemented 61 unit tests in `ui/` covering:
  - Pure functions in [format-utils.ts](file:///home/ubuntu/code/spikeycoins/ui/src/lib/format-utils.ts) (decimal calculations, volumes, currency rendering, percentage signs).
  - Helper functions in [number-utils.ts](file:///home/ubuntu/code/spikeycoins/ui/src/lib/number-utils.ts).
  - Presentational leaf components (`LoadingSpinner`, `badge`, `button`).
- **MSW & Provider Integration Harness:** Implemented a Mock Service Worker (MSW) server configuration for intercepting HTTP/Axios requests. Developed custom wrappers (`renderWithProviders` and `renderHookWithProviders` in `test-utils.tsx`) to mock context states (Auth, Account, Theme) and mock WebSockets to block real socket creation.
- **Integration Tests:** Built flagship integration tests for:
  - `useWatchlist.test.tsx` (initial loading, Authorization header checks, optimistic additions with error rollbacks, removals, and filters).
  - `OrdersCard.test.tsx` (order lists, empty states, vendor-specific currency prefix formatting, and `401 Unauthorized` token expiry redirect checks).

### Backend Testing Setup
- **Vitest Setup:** Stood up a dedicated Node-based Vitest runner configuration inside `web-server/vitest.config.ts` mapping path aliases (`@/*` to `src/*`).
- **Orchestration Unit Tests:** Created [binance-futures-order.service.test.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/binance-futures-order.service.test.ts) implementing 15 unit/integration tests mapping mock client actions. Covered precision rounding, stop price validations, leverage exception swallowing, conditional route mapping, and companion SL/TP order failures.

---

## 3. Verified Green Gate Matrix

All tests and builds compiled and passed cleanly:
- **UI Module:** 61 tests passing across 7 test files, TypeScript compile clean (`tsc --noEmit` success), and clean ESLint linting.
- **Web Server Module:** 15 tests passing, TypeScript compile clean, production build (`dist/` compilation via `tsc` success), and clean ESLint checks on new files.
- **Total:** 76 tests passing across 8 files.

---

## 4. Retrospective

### What Went Well
- **Incremental commits & per-iteration verification:** Checking in code and immediately verifying it per iteration allowed for quick debugging and minimized regressions.
- **Mutation checks:** The mutation checks performed during test verification (such as swapping parameters or toggling conditional flags) caught real gaps in test assertions, ensuring that the tests were robust and not just passing superficially.

### Carrying Forward as Process
- **Balanced Workloads:** Each refactoring iteration paired a complex/heavy component change with a lighter one, preventing developer fatigue and keeping code review scopes manageable.
- **Testing Guardrails:** Ending every testing sprint with a mutation sanity check should be codified as a rule to verify the fidelity of the test assertions.

### Remaining Unmitigated Risks
- **No live integration smoke tests:** Currently, all broker APIs and WebSocket connections are fully mocked. We have no runtime integration sanity checks against the live Sandbox or production endpoints of Binance or Upstox. This remains an unmitigated risk that should be evaluated in subsequent sprints before implementing execution-path modifications.

---

## 5. Backlog Ledger Reconciled

The [BACKLOG.md](file:///home/ubuntu/code/spikeycoins/docs/BACKLOG.md) has been reconciled to reflect the finished outcomes:
- **BG-001** (AES-256-GCM database secrets encryption): Verified active (`✅ Done`).
- **BG-015** (MSW + render wrappers + useWatchlist & OrdersCard tests): Marked `✅ Done`.
- **BG-016** (Backend Vitest config + binance-futures-order service tests): Marked `✅ Done`.
- **BG-014** (Backend `format-utils` & `BrokerFactory` unit tests): Left as `To Do` but annotated as unblocked by **BG-016**.
