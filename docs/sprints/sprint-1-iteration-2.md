# Plan: Sprint-1 Iteration 2 — card/selector test coverage + `auth.ts` split

## Context

Second iteration of [Sprint-1](sprint-1-plan.md). One medium testing item (BG-020) + one light refactor (BG-023). BG-020 now pays off the BG-022 dedup: instead of re-testing four copies of the fetch machine, we test the shared `useAccountCardData` hook **once** and keep the per-card tests thin.

---

## Part 1 — BG-020: Extend frontend test coverage *(testing, medium)*

The iteration-1 dedup changed the right test strategy. Split into three layers:

### 1a. `useAccountCardData.test.tsx` — the shared hook *(the payoff, new)*
Test the data-fetch machine once via `renderHookWithProviders` + MSW (mirrors the `useWatchlist` test approach):
- Initial load populates `data`, flips `loading`, carries the auth header.
- `selectedAccountId` filters to a single account; multi-account fan-out aggregates via `Promise.allSettled`.
- 401 → pushes an `accountErrors` entry with `requiresReauth`.
- `classifyError` path → a custom classified error (the Holdings 403 `isPermissionError` shape) lands in `accountErrors` instead of the generic 401 branch.
- `extractItems` is applied (e.g. a Funds-style single-object wrap vs an Orders-style array).
- `dedupeInFlight` → two simultaneous non-refresh fetches for the same account hit the network once (assert via a request **counter** incremented in the MSW handler, not handler identity).
- `refresh(account)` bypasses the dedupe cache and re-fetches.
- Generic error (non-401, no classifier) → sets `error`, leaves `accountErrors` empty.

> ⚠️ **`PROMISE_CACHE` is a module-level global** in `useAccountCardData.ts` — it is **not** reset by `setup.ts`'s `afterEach` (which only clears mocks/storage), and entries self-delete on a 2s `setTimeout`. So: (a) give each test a **unique `accountId`** to avoid cross-test cache-key collisions, and (b) for the dedupe assertion, fire the two fetches before awaiting and count handler hits; if you need to assert the post-2s re-fetch, drive it with `vi.useFakeTimers()`/`advanceTimersByTime(2000)` rather than real waits. Only the `dedupeInFlight: true` path uses the cache, so non-Positions tests are unaffected.

### 1b. Per-card render tests — thin *(new: Funds/Holdings/Positions)*
Each card already has the hook covered, so these assert only the card's **own** rendering, not the fetch machine. Mirror the existing `OrdersCard` test but trimmed:
- **FundsCard:** renders balance rows for an account; multi-account summary totals; vendor `$`/`₹` via `formatBrokerAmount`; "Failed to load funds" when an account has no data.
- **HoldingsCard:** renders the holdings table rows; the **403 permission** banner (distinct from 401 reauth — its unique branch); `$`/`₹` formatting; empty state.
- **PositionsCard:** renders position rows + P&L sign classes; empty state. (Caching is the hook's concern — covered in 1a.)

### 1c. `AccountSelector.test.tsx` — pure presentational *(new, no MSW)*
Props-only component (`accounts`, `selectedAccount`, `onAccountSelect`). Test: renders the selected account; "No accounts" empty state; opening the dropdown lists accounts; clicking one fires `onAccountSelect` with that account; the per-vendor icon (`getAccountIcon`) renders — incl. the `isDemo` branch (the fn takes `(accountType, isDemo)`).

> ⚠️ **Radix `Select` in jsdom — the real cost of this test.** AccountSelector wraps `@radix-ui/react-select` (`SelectTrigger`/`SelectContent`/`SelectItem`). Radix Select needs browser APIs jsdom lacks; the open→select flow will throw/no-op without setup. Required (one-time, also unblocks future Radix tests like `TradingTabs`/modals):
> 1. **Add dev dep `@testing-library/user-event`** — `fireEvent` is insufficient for Radix's pointer-driven open; use `userEvent.click(trigger)` then `userEvent.click(option)`.
> 2. **Polyfill in `setup.ts`:** `Element.prototype.hasPointerCapture`, `releasePointerCapture`, `scrollIntoView` (all `vi.fn()`), and a `ResizeObserver` stub class. (`matchMedia` is already there.)
>
> **Fallback if the open flow is still flaky:** scope this file to the closed-state assertions (selected value, empty state, icon incl. `isDemo`) and defer the open/select-callback interaction to a follow-up — don't sink the iteration fighting the portal. Recommended path is the proper setup above, since it's reusable. The card tests (1b) need **none** of this — they render Badge/Button/table only, no Radix in the tested paths.

### MSW handlers to add
`*/api/funds`, `*/api/holdings`, `*/api/positions` in [handlers.ts](../../ui/src/__tests__/msw/handlers.ts) — shaped like the real envelopes, and **filtering on the `vendor` query param** to mirror the existing `/api/orders` handler (so single-account tests get one vendor's rows):
- funds → `{ success: true, funds: { totalBalance, availableBalance, … } }` (single object, not array).
- holdings/positions → `{ success: true, data: [ … ] }` (arrays). Include one binance + one upstox row so vendor `$`/`₹` formatting is exercised.

### Existing `OrdersCard.test.tsx`
Leave it as the regression guard (it already passed unchanged through the BG-022 migration). Optionally trim its fetch-machine assertions now that 1a owns them — but keep at least the render + 401 + `$`/`₹` cases. Low priority; don't expand scope chasing it.

---

## Part 2 — BG-023: Split `auth.ts` (936 lines) by concern *(refactor, light)*

Behavior-preserving move. The file is already sectioned; mounted once at `app.use("/api/auth", authRouter)` ([server.ts:132](../../web-server/src/server.ts)).

**New structure** `web-server/src/routes/auth/`:
- `user.ts` — `POST /register`, `POST /login`, `POST /refresh`, current-user GET (line ~322).
- `session.ts` — `GET /status`, `GET /logout`, `POST /logout`.
- `google.ts` — `GET /google`, `GET /google/callback`.
- `upstox.ts` — `GET|POST /upstox/login`, `GET /upstox/callback`, `POST /upstox/sandbox-token`.
- `binance.ts` — `POST /binance/validate`.
- `constants.ts` — shared module-level state (see below).
- `index.ts` — creates the parent `Router`, mounts each sub-router at `/`, exported default so `server.ts`'s `import authRouter from "./routes/auth"` resolves unchanged (directory index).

**Path convention (decided):** every sub-router registers its **full original path** (`/register`, `/status`, `/upstox/login`, `/binance/validate`) and all mount at `router.use("/", subRouter)` in `index.ts`. Rationale: the sections share no clean URL prefix (user = `/register|/login|/refresh`, session = `/status|/logout`), and keeping full paths makes the final route table **textually identical** to the original → the before/after diff in verification is trivially clean. Do **not** mount at prefixes like `/upstox`.

**Shared state — verified, route it deliberately (not copy-paste):**
- **`FRONTEND_URL`** — used by **both** `google.ts` (success/redirect) **and** `upstox.ts` (callback redirects). → `constants.ts`, imported by both.
- **Google-only** (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `ALLOWED_REDIRECT_ORIGINS`, `isValidRedirectUrl`) → live in `google.ts`. Single-section; no need to share.
- **`generateToken` / `generateRefreshToken`** already imported from `auth-middleware.ts` — `user.ts` and `google.ts` each import directly from there. No new helper.
- Keep `server.ts` untouched (directory index preserves the import).

**Explicitly out of scope (pre-existing duplication, do NOT fix here):** register/login/refresh/google-callback each repeat the same "issue access+refresh token → persist `RefreshToken` → set cookies" sequence (~5 sites). Consolidating that into an `issueSession(user, res)` helper is a *logic* change, not a relocation — keep this move behavior-preserving and file the consolidation separately (candidate BG-026) so the route-table diff stays clean.

---

## Verification
1. `cd ui && npm run test` — new hook + card + selector suites pass; existing `OrdersCard`/`useWatchlist` tests still green.
2. `cd ui && npx tsc --noEmit` — clean.
3. `cd web-server && npm run type-check && npm run build` — clean (the auth split compiles).
4. `npx eslint` on all new/changed files — clean (hold the iteration-1 bar: no new `any`, no dead imports).
5. **auth split is behavior-preserving:** enumerate the route table before/after (`grep -rnE "router\.(get|post|put|delete)" routes/auth*`) and diff — every method+path under `/api/auth` must be present, once.
6. **Mutation sanity:** one new hook assertion (e.g. break the 401 branch → hook test fails) and confirm an auth route still resolves end-to-end (hit `/api/auth/status`).

## Sequencing & commits
Part 1 is the larger half (1 hook suite + 3 card suites + 1 selector suite + 3 handlers) — keep it sized by committing per file in this order: **MSW handlers → `useAccountCardData.test` (1a) → card tests (1b) → `AccountSelector.test` (1c)**. The card tests are deliberately thin (1a owns the fetch machine) to keep the iteration from ballooning. Then Part 2 (auth split) as its own commit(s): `constants.ts` + sub-routers → `index.ts` swap → delete old `auth.ts`.

## Notes
- Do Part 1 first — locks card behavior before Part 2 touches anything; Part 2 is backend/independent.
- **One new dev dependency (Part 1):** `@testing-library/user-event` for the Radix `Select` interaction in 1c (plus the jsdom polyfills in `setup.ts`). Nothing else new.
- Part 2 is pure relocation — no logic edits; if a logic change feels necessary, stop and file it separately (see the `issueSession` note → candidate BG-026). Each sub-router imports only what it uses (e.g. `user.ts`/`session.ts` import `requireAuth` from `auth-middleware`; the current-user GET at line ~322 is `requireAuth`-gated).
- After this, iteration 3 = BG-014 + BG-025 (backend tests + `any`-reduction) and BG-021 (Kite script). BG-024 (TradingWindow) remains a Sprint-2 candidate.
