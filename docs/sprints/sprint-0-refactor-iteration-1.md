# Plan: Two backend refactors — Upstox per-request client + order-monitor dedup

## Context

Two refactors surfaced during the codebase audit, both contained and high-value:

1. **Upstox broker client is a shared mutable singleton** ([upstox-service.ts](web-server/src/lib/upstox-service.ts)). `BrokerFactory.getUpstoxClient` and the Upstox auth routes mutate its `apiKey`/`apiSecret`/`accessToken`/`client` fields on every request, then hand back the same global instance. Two concurrent Upstox requests for different accounts can clobber each other's credentials mid-flight — one user's order can execute with another user's token. Binance already avoids this by constructing `new BinanceService()` per request (Kite, the other offender, was just removed). This makes Upstox match that safe pattern.

2. **`binance-order-monitor.ts` duplicates Binance Futures REST plumbing** — `axios.create(...)` appears 7×, a hand-rolled HMAC `signRequest` closure 4×, plus `await import("axios")`/`await import("crypto")` scattered through hot paths, and two near-identical cleanup methods. `BinanceService` already exposes every futures method the monitor needs, each routed through the shared rate limiter (`scheduleRequest`). Delegating to it removes ~200 lines and a second, drifting copy of Binance auth/signing.

Both are pure internal refactors: no API surface, request/response shapes, or behavior change.

---

## Refactor 1 — Upstox client per-request

Mirror the Binance pattern exactly (see `BrokerFactory.getBinanceClient` + `BinanceService` constructor).

- **[upstox-service.ts](web-server/src/lib/upstox-service.ts):** change the `private constructor()` to `public` so the class can be `new`ed. Leave `getInstance()` and the `export default upstoxService` singleton in place for backward-compat (see UpstoxProvider note below). No other changes to the class — all instance fields/methods already read from `this`, so a fresh instance is fully isolated. There is no websocket/ticker or per-instance long-lived resource (`getMarketDataAuth()` just returns a URL string; the rate `limiter` is a separate shared module).
- **[broker-factory.ts](web-server/src/lib/broker-factory.ts) `getUpstoxClient`:** replace the singleton init with `const service = new UpstoxService(); service.initializeWithCredentials(apiKey, apiSecret, isSandbox); if (accessToken) service.setAccessToken(accessToken); return service;` — identical shape to `getBinanceClient`. Requires importing the `UpstoxService` class (named export) alongside/instead of the default.
- **[auth.ts](web-server/src/routes/auth.ts) Upstox routes** (GET `/upstox/login`, POST `/upstox/login`, GET `/upstox/callback` — the 3 spots that call `upstoxService.initializeWithCredentials(...)` directly): construct a local `new UpstoxService()` per handler instead of mutating the imported singleton. `getLoginURL()` and `generateSession()` derive all state from the account record re-fetched in each handler, so no cross-request state is needed.
- **Export the class:** add `export class UpstoxService` (named) so the factory and auth routes can instantiate it, keeping the default singleton export too.

**Call sites that stay as-is (already safe):**
- All trading routes ([orders.ts](web-server/src/routes/orders.ts), [positions.ts](web-server/src/routes/positions.ts), [funds.ts](web-server/src/routes/funds.ts), [holdings.ts](web-server/src/routes/holdings.ts), [trading.ts](web-server/src/routes/trading.ts), [historical-data.ts](web-server/src/routes/historical-data.ts), [routes/upstox.ts](web-server/src/routes/upstox.ts)) go through `BrokerFactory.getUpstoxClient`, so they automatically get per-request instances.
- `routes/upstox.ts` `resolveInstruments` and `UpstoxProvider` use the default singleton for **stateless** work. **UpstoxProvider note:** it imports the singleton and calls `isLoggedIn()`, but it is never registered (server.ts registers only `BinanceProvider`; no `new UpstoxProvider()` exists in the repo) — it is dead code today. Keeping the singleton export means zero behavior change for it; do not attempt to rework it here.

---

## Refactor 2 — order-monitor delegates to BinanceService

Adopt "Option A" (delegate, don't re-implement). Per-account, store a `BinanceService` instance and call its methods.

- **[binance-order-monitor.ts](web-server/src/lib/binance-order-monitor.ts):**
  - Add `binanceService: BinanceService` to the `AccountConnection` interface; in `connectAccount()` create it once (`new BinanceService(); initializeWithCredentials(account.apiKey, account.apiSecret, isTestnet)`).
  - Replace every raw `axios.create` + `signRequest` + REST call with the existing methods (all already routed through `BinanceService.scheduleRequest`, so drop the monitor's outer `scheduleRequest` wrappers to avoid double-scheduling):
    - `getFuturesPositions()` (was GET `/fapi/v2/positionRisk`)
    - `getFuturesOpenOrders(symbol?)` (was GET `/fapi/v1/openOrders`)
    - `getFuturesOpenAlgoOrders(symbol?)` (was GET `/fapi/v1/openAlgoOrders`)
    - `cancelFuturesOrder(symbol, orderId)` (was DELETE `/fapi/v1/order`)
    - `cancelFuturesAlgoOrder(symbol, algoId)` (was DELETE `/fapi/v1/algoOrder`)
    - These methods return the unwrapped data array directly — adjust call sites that currently read `response.data`.
  - **Merge the two cleanup methods:** extract `private async cancelConditionalOrders(conn, symbol, openOrders, algoOrders)` holding the shared "skip if pending entry order, else cancel all conditional types" logic. `cleanupOrdersForSymbol` fetches position/orders (via the service) then calls it; `pollOrphanedOrders` already has the data and calls it directly. **Delete `cleanupOrdersForSymbolOptimized`.**
  - `cancelRemainingSlTp` keeps its distinct logic (cancel the *opposite* type after a fill) but delegates its fetch/cancel calls to the service methods — no shared helper needed there.
  - Remove all `await import("axios")` / `await import("crypto")` and the 4 `signRequest` closures from the monitor.
- **listenKey endpoints** (POST/PUT/DELETE `/fapi/v1/listenKey`) used by `establishWebSocket`, `keepAlive`, `disconnectAccount` are **not** on `BinanceService`. Add three thin methods there to fully eliminate raw axios from the monitor, mirroring the existing futures methods (use `this.futuresClient` + `BinanceService.scheduleRequest`; these are USER_STREAM endpoints — APIKEY header only, no HMAC signature):
  - `createFuturesListenKey(): Promise<string>` → POST, returns `listenKey`
  - `keepAliveFuturesListenKey(listenKey): Promise<void>` → PUT
  - `closeFuturesListenKey(listenKey): Promise<void>` → DELETE
  - Add to [binance-service.ts](web-server/src/lib/binance-service.ts) next to the other futures methods.

---

## Verification

1. **Type-check + build (backend):** `cd web-server && npm run type-check && npm run build` — must be clean. (Frontend untouched.)
2. **No regressions in lint counts:** `npm run lint` — confirm the error/warning count is not higher than the pre-existing baseline (the codebase already has unrelated style errors; these refactors should add none, and should *remove* the `no-var-requires`/dynamic-import smell in the monitor).
3. **Grep gates:**
   - Monitor cleaned: `grep -nE 'axios\.create|signRequest|await import\("axios"\)|await import\("crypto"\)' web-server/src/lib/binance-order-monitor.ts` → no matches.
   - Upstox per-request: `grep -n "new UpstoxService" web-server/src/lib/broker-factory.ts web-server/src/routes/auth.ts` → present; `BrokerFactory.getUpstoxClient` no longer returns the shared singleton.
4. **Runtime smoke (manual, requires a connected Upstox + a Binance Futures account):**
   - Upstox: load `/api/trading/summary`, `/api/positions`, `/api/orders` for an Upstox account and confirm correct data; ideally hit two different Upstox accounts concurrently and confirm responses don't cross over.
   - Order monitor: start the server, confirm `[OrderMonitor]` logs show listenKey creation + WebSocket connect; place a futures order with SL+TP on testnet, let one trigger, and confirm the opposite order is auto-cancelled (exercises `cancelRemainingSlTp`) and that closing a position cleans up orphaned SL/TP (exercises the merged `cancelConditionalOrders` via both the WS path and the poller).
5. **Concurrency sanity (optional):** fire parallel requests for two Upstox accounts (e.g. via `curl` with different `accountId`s) and verify each returns its own account's data.

## Notes
- Pure refactor: keep all logging strings, retry/backoff, hibernation, and rate-limit-skip logic in the monitor intact — only the transport/signing is swapped.
- No DB or frontend changes. No new dependencies.
