# Plan: Sprint-1 — Hardening (security + test coverage)

## Context

Sprint-0 cleared the major architectural debt (three god-files split, broker-credential races fixed, Kite removed) and stood up the test foundation. We earmarked Sprint-1 for "more refactoring" — but verifying the carry-over ledger against the actual code shows **the big refactors are already done and the remaining refactor carry-over was a false positive**. So Sprint-1 is most honestly a **hardening sprint**: close the one real security gap, expand test coverage on the harnesses just built, and re-audit for any genuinely new refactor targets rather than assume they exist.

### Carry-over reconciliation (verified against source)
- **BG-017 (CORS wildcard)** — **real.** `web-server/src/server.ts:85` allows any `origin.endsWith('.vercel.app')`. Legitimate hardening target.
- **BG-018 (auth-route ownership)** — **already done.** `requireAccountAccess` (`auth-middleware.ts:187`) returns 403 when `account.userId !== req.user.id`, applied to 9 route modules; `historical-data.ts` enforces the same check inline (it can't use the middleware because `accountId` is optional on its primary path). No gap → close as Done.
- **BG-019 (cross-app `format-utils` dedup)** — **non-issue.** `ui/src/lib/format-utils.ts` (display formatters) and `web-server/src/lib/format-utils.ts` (API-response normalizers) share **zero** functions. Nothing to dedup → reframe or close.
- **BG-014, BG-020, BG-021** — all real (see below).

---

## Scope (recommended sequence)

Ordered by dependency and risk, alternating heavier and lighter work. The refactor re-audit is **done** — its findings (R1–R4 / BG-022–BG-025) are folded into the sequence below rather than listed as a separate discovery step. Detailed refactor descriptions live in the "Refactoring deliverables" section.

### Iteration 1 — security + the card-dedup refactor *(detailed in [sprint-1-iteration-1.md](sprint-1-iteration-1.md))*
1. **BG-017 — Tighten CORS** *(security, light, lead)*
   - Drop the blanket `origin.endsWith('.vercel.app')` allow in `server.ts`; rely on the explicit env-driven `ALLOWED_ORIGINS` list (+ the existing dev-localhost and no-origin allowances). Preview deploys add their origin to `ALLOWED_ORIGINS`.
   - Extract the origin decision into a testable `isOriginAllowed(origin, opts)` and unit-test it.
2. **BG-022 (R1) — Dedup trading-card data-fetching into `useAccountCardData`** *(refactor, medium)*
   - Must land **before** BG-020 so the card tests target one shared hook, not four copies.

### Iteration 2 — testing expansion
3. **BG-020 — Extend FE integration tests** *(testing, medium)* — `FundsCard`/`HoldingsCard`/`PositionsCard` + `AccountSelector` on the MSW + `renderWithProviders` harness; add handlers for `/api/funds`, `/api/holdings`, `/api/positions`. Depends on BG-022.
4. **BG-023 (R2) — Split `auth.ts` by concern** *(refactor, light)* — `routes/auth/{user,google,session,upstox,binance}.ts`; behavior-preserving, verify by route-by-route diff.

### Iteration 3 — backend tests + type tightening + cleanup
5. **BG-014 + BG-025 (R4) — Backend tests + `any`-reduction, paired** *(testing + refactor, medium)*
   - BG-014: table-driven tests for `web-server/src/lib/format-utils.ts` (pure) + `BrokerFactory` (per-request client for `upstox`/`binance`, unknown-type handling, mocked services).
   - BG-025: tighten `any` in `binance-futures.service.ts` / `upstox-service.ts` / `trading.ts` — the tests make the type changes safe. End with a mutation check.
6. **BG-021 — Resolve the Kite migration script** *(operational, light)* — decide on prod-DB run, execute if needed, delete the script.

**Deferred to Sprint-2:** BG-024 (R3) `useTradingWindow` extraction — heavy, order-entry path; wants the BG-020 harness mature first.

---

## Refactoring deliverables (re-audit findings)

The time-boxed re-audit *did* surface real targets — the Sprint-0 god-files are resolved, but a new tier emerged. Ranked by value/risk; recommended adds for Sprint-1 are marked **[ADD]**, larger ones are **[candidate]** for Sprint-2.

### R1 — Dedup trading-card data-fetching into a shared hook **[ADD, light, high-value]**
- `OrdersCard`/`FundsCard`/`HoldingsCard`/`PositionsCard` each repeat the same machine: 6 `useState`, a `fetch<X>ForAccount` fn, identical 401/`requiresReauth` handling, an identical `AccountError` interface, and `Promise.allSettled` fan-out. ~1790 lines across the four with heavy structural duplication.
- Extract `useAccountCardData(endpoint, accounts, selectedAccountId)` owning the fetch/refresh/error/auth-error state; cards keep only their rendering + row mapping.
- **Synergy:** do this *before* BG-020 so the card tests cover one shared hook instead of four copies. Mirrors the proven `useWatchlist` extraction.

### R2 — Split `auth.ts` (936 lines) by concern **[ADD, light, low-risk]**
- Already sectioned (User / Google OAuth / Status / Logout / Upstox / Binance). Split into `routes/auth/{user,google,session,upstox,binance}.ts` mounted by an `index.ts`. Pure move + re-export; behavior-preserving, easy to verify by route-by-route diff.

### R3 — Extract `useTradingWindow` from `TradingWindow.tsx` (2800 lines) **[candidate, heavy, higher-risk]**
- The new biggest component: 33 `useState`, 11 `useEffect`, 31 handlers. Same hook-extraction pattern as `useWatchlist`, but ~2.3× the size and on the **order-entry money path**, so it needs careful, staged extraction + the BG-020 harness in place first.
- Recommendation: defer to Sprint-2 unless R1+R2 finish with capacity to spare — too big to rush alongside the security/testing work.

### R4 — Backend `any`-type reduction **[opportunistic, pairs with BG-014]**
- Concentrated in `binance-futures.service.ts` (31), `upstox-service.ts` (24), `trading.ts` (21). Tighten the response/param types as BG-014 adds tests around the same files (tests make the type changes safe). Scope to those three files; don't chase repo-wide.

> Other large files noted but **not** scoped (charting/visualization, lower churn, lower risk): `MultiTimeframeChart.tsx` (1792), `TradingPanelTabs.tsx` (1483), `trading-data-context.tsx` (882), `ResearchService.ts` (922). File as Sprint-2 candidates if they start causing friction.

---

## Out of scope / deferred
- Larger Phase-2 roadmap features (trailing SL/OCO, webhook executor) — not hardening; keep in the roadmap.
- A live/integration smoke harness against broker sandboxes — the unmitigated risk flagged in the Sprint-0 retrospective. Worth a dedicated sprint; too big to fold in here.

## Verification
1. `cd web-server && npm run test && npm run type-check && npm run build` — green; new `format-utils`/`BrokerFactory` tests pass.
2. `cd ui && npm run test && npx tsc --noEmit` — green; new card/selector tests pass.
3. `npx eslint` on all new files — clean.
4. CORS: manual/automated check that a disallowed origin is blocked and allowed origins pass.
5. Mutation sanity on at least one new backend suite and one new frontend suite.
6. Refactors (R1/R2) are behavior-preserving: card UI renders identically (covered by BG-020 tests); `auth.ts` split verified by route-by-route diff + all auth flows still resolve. No new lint/type errors.

## Notes
- Backlog corrections this sprint surfaces (apply at planning time): **BG-018 → Done** (ownership already enforced); **BG-019 → reframe to a trivial "rename `web-server/format-utils` for clarity" or close as won't-do** (no shared logic with `ui`).
- This sprint deliberately leads with security (BG-017) despite the "refactoring" label, because the refactoring backlog is effectively empty and CORS is the one open real risk.
- Keep the Sprint-0 process habits: one heavy + one light per working session, incremental commits, mutation check to close each test addition.
