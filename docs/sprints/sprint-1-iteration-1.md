# Plan: Sprint-1 Iteration 1 — CORS hardening + trading-card data-fetch dedup

## Context

First iteration of [Sprint-1](sprint-1-plan.md). Pairs one light security fix with one medium refactor (the established one-heavy-one-light cadence). Both are independent (different stacks), so order doesn't matter, but the refactor (BG-022) **must** land this iteration because it unblocks the card tests in iteration 2 (BG-020).

---

## Part 1 — BG-017: Tighten CORS *(security, light)*

**Current state** ([server.ts:63–97](../../web-server/src/server.ts)): an env-driven `ALLOWED_ORIGINS` list exists, but it's undermined by a blanket `if (origin.endsWith('.vercel.app')) return callback(null, true)` — any `*.vercel.app` site can call the API with credentials.

**Change:**
- Extract the origin decision into a pure, testable function:
  ```ts
  export function isOriginAllowed(
    origin: string | undefined,
    opts: { allowedOrigins: string[]; isProduction: boolean }
  ): boolean
  ```
  preserving the intentional behaviors: no-origin → allowed (curl / same-origin / mobile); dev + `localhost` → allowed; origin in `allowedOrigins` → allowed.
- **Remove** the `.vercel.app` blanket branch. Preview/production deploys are added explicitly to `ALLOWED_ORIGINS` (document this in `.env.example` if present).
- Wire `cors({ origin: (o, cb) => isOriginAllowed(o, {...}) ? cb(null,true) : cb(new Error("Not allowed by CORS")), credentials: true })`.

**Test:** `web-server/src/server.test.ts` (or co-located util test) — disallowed origin rejected; configured prod origin + dev-localhost + no-origin pass; a `*.vercel.app` origin is now **rejected** unless explicitly listed (the regression guard for this fix).

---

## Part 2 — BG-022: Extract `useAccountCardData` *(refactor, medium)*

**Current state:** `OrdersCard`, `FundsCard`, `HoldingsCard`, `PositionsCard` (~1790 lines total) each re-implement the same data-fetch machine — 6 `useState`, a `fetch<X>ForAccount(account, isRefresh)`, a `fetchAll`, a `handleRefresh`, an `accountErrors[]` reauth flow, an identical `AccountError` interface, and a `Promise.allSettled` fan-out keyed off `[JSON.stringify(account ids), selectedAccountId]`.

**New files:**
- `ui/src/hooks/useAccountCardData.ts` (new `hooks/` dir) — the shared hook.
- `ui/src/hooks/account-card-types.ts` — the shared `AccountError` interface (currently duplicated 4×).

**Hook shape** (must absorb the four real variations found in the audit, not just the happy path):
```ts
function useAccountCardData<T>(opts: {
  endpoint: string;                      // "/orders", "/funds", ...
  accounts: TradingAccount[];
  selectedAccountId?: string;
  extractItems: (responseData: any, account: TradingAccount) => T[];
  buildRequestUrl?: (account: TradingAccount) => string;     // Positions: cache-bust "&_=Date.now()"
  requestConfig?: AxiosRequestConfig;                        // Positions: no-cache headers
  classifyError?: (axiosError, account) => AccountError | null; // Holdings: 403 isPermissionError
  dedupeInFlight?: boolean;              // Positions: the POSITIONS_PROMISE_CACHE behavior
}): {
  data: T[];
  loading: boolean;
  error: string | null;
  accountErrors: AccountError[];
  refreshing: string | null;
  refresh: (account: TradingAccount) => Promise<void>;
  refetchAll: () => Promise<void>;
}
```

**Per-card variation mapping (verified against source — these are the must-preserve behaviors):**
| Card | `extractItems` | Error extras | Request extras |
|---|---|---|---|
| Orders | `response.data.data` (array) | 401 only | — |
| Positions | `response.data.data` (array) | 401 only | cache-bust query + no-cache headers + in-flight `Promise` cache |
| Holdings | `response.data.data` (array) | **403 `isPermissionError`** (non-reauth) + 401; reads `suggestion` | — |
| Funds | `response.data.funds` (single obj, wrapped w/ accountId/name/vendor/timestamp) | 401 only | — |

**Migration:** rewrite each card to call the hook and keep only its render + row mapping. Default 401→reauth handling lives in the hook; Holdings passes a `classifyError` for the 403 permission case; Positions passes `buildRequestUrl`/`requestConfig`/`dedupeInFlight`; Funds passes the wrapping `extractItems`.

**Behavior must not change** — this is pure extraction. The existing 401 re-auth UI, permission-error UI (Holdings), and Positions caching all keep working identically.

---

## Verification

1. `cd ui && npx tsc --noEmit` — clean.
2. `cd ui && npm run test` — existing `OrdersCard` integration test (from BG-015) still passes **unchanged** — it's the regression guard proving the Orders migration preserved behavior.
3. `cd web-server && npm run test && npm run type-check` — `isOriginAllowed` test passes; build clean.
4. `npx eslint` on all new/changed files — clean.
5. **Mutation sanity:** (a) make `isOriginAllowed` return `true` unconditionally → CORS test fails; (b) break `extractItems` for one card → that card's test (or a temporary assertion) fails.
6. Manual smoke: all four cards still render rows, empty states, and the reauth/permission banners for a binance + an upstox account.

## Notes

- Land Part 2 before BG-020 (iteration 2) so the new card tests cover the single shared hook.
- `OrdersCard`'s existing BG-015 test is the safety net for the riskiest part of the migration — run it after each card swap, Orders first.
- Keep commits small: `isOriginAllowed` + test → card hook + types → migrate Orders → migrate the other three. Each step type-checks independently.
- No new dependencies. No backend behavior change beyond the CORS tightening.
