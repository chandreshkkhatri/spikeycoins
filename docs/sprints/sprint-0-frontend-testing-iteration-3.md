# Plan: Testing Iteration 3 — MSW + provider-aware render harness, first integration tests (BG-015)

## Context

Iterations 1–2 stood up Vitest/RTL and banked mock-free coverage on pure utilities and leaf components. The valuable frontend code left — the trading cards and `useWatchlist` — needs **network mocking** and a **provider-aware render** before it's testable. This iteration builds that reusable infrastructure (the actual deliverable) and proves it with the first real integration tests on the highest-risk, most-recently-AI-refactored UI paths. Tracked as **BG-015**.

> The backend companion (`binance-futures-order.service.ts`) has been split into its own sprint — see [sprint-0-backend-testing-setup.md](sprint-0-backend-testing-setup.md) (**BG-016**) — because it needs a separate `web-server` Vitest config and uses dependency-injected mocking rather than MSW. This sprint is frontend-only.

Grounding facts that shaped the approach (verified against source):
- `useWatchlist.ts` consumes `useAuth()` (needs `AuthProvider`), calls native `fetch` via `getApiUrl(...)`, reads/writes `localStorage`, and subscribes to two WebSocket singletons (`binanceWebSocketService`, `upstoxWebSocket`) on mount.
- The trading cards (`OrdersCard`, etc.) call the axios `api` instance and use `next/navigation`'s `useRouter`.

MSW intercepts both native `fetch` and axios (via XHR/node) through one `setupServer`, so a single mock layer covers both the hook and the cards.

---

## Track A — Frontend test infrastructure (the reusable core)

### 1. Dependencies (`ui`)
- `msw` (dev) — request mocking via `setupServer`.

### 2. `ui/src/__tests__/msw/handlers.ts`
Default happy-path handlers for the endpoints the first tests exercise: `GET /api/watchlist/symbols`, `GET /api/watchlist/system/binance-futures`, `GET /api/prices`, `POST /api/watchlist/symbols`, `GET /api/orders`. Keep responses minimal but shaped like the real API (`{ success: true, ... }`). Individual tests override per-case with `server.use(...)`.

### 3. `ui/src/__tests__/msw/server.ts`
Export `setupServer(...handlers)`.

### 4. Extend `ui/src/__tests__/setup.ts`
Add MSW lifecycle: `beforeAll(server.listen({ onUnhandledRequest: "error" }))`, `afterEach(() => { server.resetHandlers(); localStorage.clear(); })`, `afterAll(server.close())`. The `onUnhandledRequest: "error"` setting is deliberate — it surfaces any un-mocked call instead of letting it hang, which is exactly the failure mode AI-generated code introduces.

### 5. `ui/src/__tests__/test-utils.tsx`
A `renderWithProviders(ui, { authState?, accountState? })` wrapper that mounts `AuthProvider` (+ `AccountProvider` / `ThemeProvider` as needed) and re-exports everything from `@testing-library/react`. Provide a helper to seed an access token (the path `useWatchlist` → `getAuthHeaders` → `getAccessToken` reads) so authenticated requests carry the header MSW handlers can assert on.

### 6. WebSocket singleton mock
A shared `vi.mock("@/lib/binance-websocket")` / `vi.mock("@/lib/upstox-websocket")` helper (no-op `connect`/`subscribe`/`addSymbol`/`removeSymbol`/`disconnect`). The hook subscribes on mount; without this, tests would attempt real socket connections. Centralize so card tests that don't touch sockets stay clean.

---

## Track B — First integration tests (proving the harness)

### `useWatchlist.test.tsx` (flagship)
Use `renderHook` from RTL with the provider wrapper + WS mocks + MSW. Cover:
- **Initial load:** fetches symbols for a selected account, populates `watchlistItems`, sets `loading` false. Assert the request carried the `Authorization` header (proves the auth-header path).
- **Binance system watchlist:** when `accountType === "binance"` with no `currentWatchlistId`, the system-watchlist branch fires and prepends the synthetic "Binance Futures" entry.
- **`addSymbol`:** optimistic insert, POST fired; on POST failure (`server.use` an error handler) the optimistic add is **rolled back** (this rollback is real logic worth pinning).
- **`removeSymbol`:** removes locally + fires persist POST.
- **Sorting/filtering:** `handleSort` toggles direction; `filteredWatchlistItems` honors `searchQuery`.
- **Error path:** non-OK symbols response sets `error` and clears items.

### `OrdersCard.test.tsx` (proves harness for context+axios components)
- Renders order rows from a mocked `GET /api/orders` (`success: true` with one binance + one upstox order).
- Empty state when zero orders.
- 401 response surfaces the "Authentication Required" re-auth UI.
- Vendor formatting: a binance order renders `$`, an upstox order renders `₹` (ties back to the `formatBrokerAmount` behavior pinned in iteration 2).

---

## Verification

1. `cd ui && npm run test` — all suites pass; MSW reports **no** unhandled requests.
2. `npx tsc --noEmit` (ui) — clean, incl. the new `.tsx` test utils.
3. `npx eslint` on all new files — clean.
4. **Mutation sanity:** break one asserted behavior (e.g. delete the `addSymbol` rollback) and confirm the relevant test fails — proves the integration tests assert behavior, not just "renders."

## Notes

- Frontend-only scope (Tracks A+B). The backend order-placement service test is split into [sprint-0-backend-testing-setup.md](sprint-0-backend-testing-setup.md) (**BG-016**).
- Keep `onUnhandledRequest: "error"` — silent passthrough defeats the purpose.
- No snapshot testing (consistent with iteration 2) — explicit RTL queries only.
- Once `renderWithProviders` + MSW exist, the remaining cards (`Funds`/`Holdings`/`Positions`) and `AccountSelector` become cheap follow-ups for a later iteration — don't scope them here; this iteration is about standing up the harness and proving it on the two flagship paths.
