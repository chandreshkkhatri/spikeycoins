# Plan: Sprint-1 Iteration 3 — backend test coverage + mechanical `any`-reduction + Kite script retirement

## Context

Third and final iteration of [Sprint-1](sprint-1-plan.md): BG-014 (testing), BG-025 (refactor — rescoped below), BG-021 (operational carry-over).

**BG-025 is bigger than its one-line backlog estimate.** Re-auditing the three named files during this planning pass found the `any` counts have grown slightly since BG-025 was written (33/27/21, was 31/24/21) and — more importantly — the 27 in `upstox-service.ts` aren't homogeneous:
- ~9 are genuine **SDK-boundary** `any`s (`private client: any`, `getUpstoxClient(): any`, `(response as any).data` on calls into the untyped `upstox-js-sdk` CommonJS module) — not fixable without vendoring type defs for a third-party SDK we don't control. Out of scope.
- ~15 are **our own** return types on methods that hit Upstox's REST API directly via `fetch()` (`getFunds`, `getPositions`, `getHoldings`, `getOrders`, `getQuote`/`getLTP`/`getOHLC`, `getProfile`, `generateSession`, `getHistoricalData`) plus 3 SDK *param* shapes (`placeOrder`/`modifyOrder`/`convertPosition`) — genuinely modelable from the real API shapes, and they cascade into `trading.ts`'s `any`-typed `.map`/`.filter` callbacks (confirmed: `routes/trading.ts`, `routes/funds.ts`, `routes/holdings.ts`, `routes/orders.ts`, `routes/positions.ts`, `routes/historical-data.ts`, `routes/upstox.ts` all consume `upstox-service.ts` — a 6-route blast radius).

Modeling ~10 response shapes + 3 param shapes properly, end to end, is its own iteration-sized chunk — splitting it out as **BG-027** (filed in BACKLOG.md, Sprint-2 candidate) rather than cramming it in here. This iteration does the **mechanical, zero-behavior-risk tier** of BG-025 instead: `catch (error: any)` → `catch (error: unknown)` and untyped cache containers (`Promise<any>`) → `Promise<unknown>`, across all three files. That alone clears ~30 of the 81 current `any`s safely, verified entirely by `tsc`.

---

## Part 1 — BG-014: Unit tests for `format-utils.ts` + `BrokerFactory` *(testing)*

Both are pure-ish, dependency-light, and currently have **zero** test coverage — the highest-signal gap in the backend. Mirror the DI-mock convention already established in [`binance-futures-order.service.test.ts`](../../web-server/src/lib/binance-futures-order.service.test.ts) (`mockService as unknown as BinanceService`).

### 1a. `format-utils.test.ts` (new)
Pure functions, no I/O — straightforward table-driven tests against [format-utils.ts](../../web-server/src/lib/format-utils.ts):
- `toNumber`: null/undefined → fallback; numeric string → parsed; non-finite string → fallback; boolean → 1/0.
- `formatBinanceFuturesPosition`: quantity/averagePrice/lastPrice/pnl/pnlPercentage derived correctly from `positionAmt`/`entryPrice`/`markPrice`/`unRealizedProfit`; `breakEvenPrice` sign flips for long (`quantity > 0`) vs short; symbol fallback chain (`symbol` → `pair` → `displaySymbol` → `"UNKNOWN_SYMBOL"`); `id` format `${accountId}-${symbol}-${positionSide||"BOTH"}`.
- `formatDefaultPosition`: the `??` fallback chains for `quantity`/`averagePrice`/`lastPrice`/`pnl` (e.g. Upstox's `tradingsymbol` vs a generic `symbol` field) — at least one test per fallback chain exercising the *non-primary* key, since that's the actual bug surface (e.g. only `net_qty` present, no `quantity`).
- `formatPosition`: branches correctly — `binance` + `tradingSegment: "usdm"` → futures formatter; anything else (including `binance` spot) → default formatter merged with the raw position spread.
- `formatHolding`: binance branch computes `quantity = free + locked` and zeroes price/value fields; non-binance branch passes through the raw holding plus account metadata.
- `formatFunds`: `segment: "spot"` branch — balance aggregation summing USDT/USDC/BUSD directly vs. other assets priced via the `cryptocurrencies` lookup (test both the found-price and not-found/skipped cases); non-spot branch — the `equity.*` vs flat-field fallback chains (`available_margin` vs `totalMarginBalance`, etc.).

> Note: `format-utils.ts`'s own 6 `any` params (`position: any`, `holding: any`, `funds: any`, `cryptocurrencies: any[]`) are **not** in BG-025's named file list and are left untouched here — writing the tests against the current signatures doesn't require touching them. If you want them typed too, that's a small, separate follow-up (not filed; mention if you want it as a backlog item).

### 1b. `broker-factory.test.ts` (new)
Mock the two service classes' constructors so no real SDK/network init happens:
```ts
vi.mock("../lib/upstox-service", () => ({ UpstoxService: vi.fn() }));
vi.mock("../lib/binance-service", () => ({ BinanceService: vi.fn() }));
```
- `getUpstoxClient`: throws on `account.accountType !== "upstox"`; constructs `new UpstoxService()` and calls `initializeWithCredentials(apiKey, apiSecret, isSandbox)` with `isSandbox` from `account.metadata?.sandbox` (default `false`); calls `setAccessToken(accessToken)` **only when** `account.accessToken` is truthy (the `if` branch at [broker-factory.ts:21](../../web-server/src/lib/broker-factory.ts#L21) — assert it's *not* called when `accessToken` is undefined, since that's the easy regression to introduce).
- `getBinanceClient`: throws on `account.accountType !== "binance"`; constructs + initializes with `isTestnet` from `account.metadata?.testnet`.
- Build a minimal `IAccount`-shaped fixture per call (`_id`, `accountType`, `apiKey`, `apiSecret`, `metadata`, `accessToken?`) rather than importing the real Mongoose model — these are plain-object inputs, no DB needed.

While writing this test, **fix `getUpstoxClient`'s return type** from `any` to `UpstoxService` ([broker-factory.ts:10](../../web-server/src/lib/broker-factory.ts#L10)) — it's already imported, the change is a one-line annotation, and the new test immediately verifies the constructed instance shape.

---

## Part 2 — BG-025 (mechanical tier only): `catch (error: any)` → `unknown`, cache containers typed

Behavior-preserving, compiler-verified only — no new tests needed beyond what already exists plus Part 1.

- **All three files** (`binance-futures.service.ts`, `upstox-service.ts`, `routes/trading.ts`): every `catch (error: any)` → `catch (error: unknown)`. Inside each block, anywhere `error.message` or similar is read, narrow with the pattern already used elsewhere in this codebase (e.g. [`auth/upstox.ts`](../../web-server/src/routes/auth/upstox.ts): `error instanceof Error ? error.message : "Unknown error"`). Where the block only does `console.error(...)` then rethrows/returns without touching `.message`, no narrowing is even needed — `unknown` compiles as-is.
- **`routes/trading.ts` cache containers** ([trading.ts:13,19,28](../../web-server/src/routes/trading.ts#L13)): `Promise<any>` → `Promise<unknown>` on `CachedResponse.promise`, `getCachedSummary`, `setCachedSummary`. The cached value only ever flows to `res.json(cached)` — never destructured — so `unknown` compiles with no call-site changes.
- **Leave alone** (genuinely SDK/shape-dependent, belongs to BG-027 not this tier): `upstox-service.ts`'s `client: any`, `getUpstoxClient(): any`, all `(response as any).data` SDK-call-result casts, every `Promise<any>`/`any[]` *return type*, and `params: any` on `placeOrder`/`modifyOrder`/`convertPosition`. `binance-futures.service.ts`'s `params: any`, `(position: any)`, `(order: any)`, `algoSlTps: any[]`. `trading.ts`'s `.map`/`.filter` callback param types (`(p: any)`, `(o: any)`, etc.) — these only resolve cleanly once the upstream return types are real, which is BG-027.

---

## Part 3 — BG-021: Resolve `scripts/deactivate-kite-accounts.ts`

This was an **operational decision, not a code change** — the script connected to `MONGODB_URI` and did two irreversible-ish writes: bulk `isActive: false` on `accountType: "kite"` rows, and an unconditional `.drop()` of the `kiteconnectsessions` collection. Per this repo's data-safety norms, that DB-touching step was deliberately not run autonomously.

**Resolution:** the script is deleted from the codebase. Any stale Kite rows/collection in the live DB were cleaned up manually by the account owner, outside the codebase and outside this review — not something this assistant ran or verified.

---

## Verification

1. `cd web-server && npm run test` — new `format-utils.test.ts` + `broker-factory.test.ts` pass; existing `cors-utils.test.ts` + `binance-futures-order.service.test.ts` still green.
2. `cd web-server && npx tsc --noEmit && npm run build` — clean (confirms the `unknown` narrowing across all three files compiles).
3. `npx eslint` on all changed files — clean, no new `any` introduced (the mechanical tier should only ever *remove* `no-explicit-any` warnings, never add one).
4. **Mutation sanity:** break one `formatBinanceFuturesPosition` derivation (e.g. swap `entryPrice`/`markPrice`) and one `BrokerFactory.getUpstoxClient` branch (e.g. always call `setAccessToken`) → confirm the corresponding new test fails → revert → `git diff --stat` clean.
5. **BG-021:** done — script deleted; live-DB cleanup of stale Kite rows handled manually by the account owner.

## Sequencing & commits
1. Part 1 first (`format-utils.test.ts`, then `broker-factory.test.ts` + its one-line `getUpstoxClient` return-type fix) — these are the safety net, do them before touching any production code.
2. Part 2 (mechanical `any` → `unknown` across the 3 files) — small, independent commits per file.
3. Part 3 (BG-021) last and separately — it's a DB operation, not a code review unit; keep it out of the same commit as anything else.

## Notes
- No new dependencies.
- BG-024 (`useTradingWindow` extraction) remains a Sprint-2 candidate — not touched here.
- BG-026 (auth `issueSession` consolidation) and BG-027 (full Upstox API typing) are now filed in [BACKLOG.md](../BACKLOG.md) as Sprint-2 candidates, both spun out of this iteration's planning.
- After this, Sprint-1 is complete — all three iterations done, remaining backlog items (BG-024, BG-026, BG-027, plus the unrelated low/medium-priority feature items) roll into Sprint-2 planning.
