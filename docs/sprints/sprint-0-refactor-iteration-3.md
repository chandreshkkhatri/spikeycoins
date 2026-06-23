# Plan: Refactor Iteration 3 — BinanceService Modularization & Watchlist Hook Extraction

## Context

Iteration 2 successfully extracted the Binance futures order placement logic and consolidated frontend card helpers. Iteration 3 tackles two remaining major spots of high complexity:

1. **`binance-service.ts` is a 1263-line class** wrapping all Spot, Futures, connectivity checks, signature signing, and rate limiting logic. It mixes Spot concerns with Futures concerns, making the file large, complex, and harder to maintain. We will extract base client/signing/rate-limiting setup into a base class `BinanceClientBase`, and separate Spot and Futures operations into sub-services while preserving 100% backward compatibility via a facade.

2. **`Watchlist.tsx` is a 1258-line component** that mixes presentation/rendering with complex state logic: data fetching, WebSocket subscriptions (Upstox & Binance), requestAnimationFrame throttling, sorting, filtering, symbol additions, and watchlist creation/switching. We will extract all state and subscription management into a reusable `useWatchlist` custom hook under the same directory, slimming the component to a thin UI shell.

---

## Refactor 1 — BinanceService Modularization

**New files:**
- `web-server/src/lib/binance-client-base.ts` (exposes clients, credential initialization, signing, and static rate limiter `scheduleRequest`/`trackWeight`)
- `web-server/src/lib/binance-spot.service.ts` (Spot API operations)
- `web-server/src/lib/binance-futures.service.ts` (Futures API operations)

**Modifications:**
- **[binance-service.ts](web-server/src/lib/binance-service.ts):** Inherits from `BinanceClientBase`. Delegates all Spot and Futures operations to the respective sub-services to preserve 100% backward compatibility for all external callers (`BrokerFactory`, order monitors, sync services).

---

## Refactor 2 — Watchlist Hook Extraction

**New file:**
- `ui/src/components/watchlist/useWatchlist.ts` (handles all state, API calls, WebSocket price feeds, throttling, and sorting/filtering)

**Modifications:**
- **[Watchlist.tsx](ui/src/components/watchlist/Watchlist.tsx):** Call the `useWatchlist` hook, and render the presentational layout, significantly slimming the component.

---

## Verification

1. **Backend type-check & build:** `cd web-server && npm run type-check && npm run build` — must be clean.
2. **Frontend type-check:** `cd ui && npx tsc --noEmit` — must be clean.
3. **Lint check:** `npx eslint` on modified backend and frontend files to ensure zero errors.
4. **Smoke test:** Check that watchlist symbols render correctly with live updates, and placing/monitoring orders continues to work seamlessly.
