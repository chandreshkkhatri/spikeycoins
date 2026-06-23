# Plan: Sprint-0 Wind-Up & Closeout

## Context

Sprint-0 ("Foundation") bundled two parallel threads: a **refactoring** pass that paid down the worst architectural debt surfaced in the initial audit, and a **testing foundation** built from zero. Before we close it and resume refactoring in Sprint-1, this wind-up consolidates what shipped, confirms the repo is green, reconciles the backlog, and hands the deferred work forward as a clean Sprint-1 seed.

This is a closeout/bookkeeping sprint — **no production code changes**. The deliverables are documentation reconciliation + a verified green snapshot.

---

## What Sprint-0 delivered (inventory)

**Refactoring track**
- **Kite/Zerodha removal** — entire broker integration stripped from backend routes/models/auth, frontend components/types, npm deps, and docs; reversible DB migration (`scripts/deactivate-kite-accounts.ts`) created. Source confirmed Kite-clean (only false-positive substring matches remain).
- **Iteration 1** ([sprint-0-refactor-iteration-1.md](sprint-0-refactor-iteration-1.md)) — Upstox client made per-request (closed a cross-account credential race); `binance-order-monitor.ts` de-duplicated to delegate to `BinanceService` (~200 lines + a second HMAC-signing copy removed).
- **Iteration 2** ([sprint-0-refactor-iteration-2.md](sprint-0-refactor-iteration-2.md)) — extracted the ~540-line `orders.ts` god-handler into `binance-futures-order.service.ts`; consolidated 4× duplicated frontend card helpers into `format-utils.ts` (fixed the latent Binance `$`/`₹` formatting bug).
- **Iteration 3** ([sprint-0-refactor-iteration-3.md](sprint-0-refactor-iteration-3.md)) — split the 1262-line `binance-service.ts` into base/spot/futures modules behind a facade; extracted `useWatchlist.ts` hook from the 1258-line `Watchlist.tsx`.

**Testing track**
- **Setup** ([sprint-0-frontend-testing-setup.md](sprint-0-frontend-testing-setup.md)) — Vitest + RTL + jsdom for `ui`.
- **FE iteration 2** ([sprint-0-frontend-testing-iteration-2.md](sprint-0-frontend-testing-iteration-2.md)) — pure-util + leaf-component coverage (`format-utils`, `number-utils`, `LoadingSpinner`/`badge`/`button`).
- **FE iteration 3** ([sprint-0-frontend-testing-iteration-3.md](sprint-0-frontend-testing-iteration-3.md), BG-015) — MSW + provider-aware render harness; integration tests for `useWatchlist` and `OrdersCard`.
- **Backend setup** ([sprint-0-backend-testing-setup.md](sprint-0-backend-testing-setup.md), BG-016) — Vitest for `web-server`; first service test for `binance-futures-order.service.ts`.

**Verified green snapshot (captured at wind-up):**
- UI: **7 test files / 61 tests pass**, `tsc --noEmit` clean.
- Backend: **1 test file / 15 tests pass**, `tsc --noEmit` clean, `build` clean.
- Total: **76 tests across 8 files, all green.**

---

## Closeout tasks

### 1. Backlog reconciliation ([BACKLOG.md](../BACKLOG.md))
- Flip **BG-015** (MSW + render wrapper + useWatchlist/card tests) → ✅ Done.
- Flip **BG-016** (backend Vitest + service test) → ✅ Done.
- Confirm **BG-001** (AES-256-GCM secrets) status is accurate (currently ✅ Done — verify it reflects reality, since it's the one security item the audit flagged as addressed).
- Leave **BG-014** (backend `format-utils`/`BrokerFactory` tests) as To Do but annotate "unblocked by BG-016" — it's the cheapest Sprint-1 testing win.

### 2. Write the Sprint-0 retrospective section
Append a short retrospective to this doc (or a `## Retrospective` block): what went well (incremental commits + per-iteration verification + mutation checks caught real gaps), what to carry as process (every refactor iteration paired one heavy + one light change; every test sprint ended with a mutation check), and the one risk that remains unmitigated (no runtime/integration smoke against live brokers — all broker behavior is mocked).

### 3. Confirm clean working tree + green snapshot
Re-run the full gate matrix (below) and confirm zero uncommitted changes after the doc updates are committed.

---

## Sprint-1 seed (carry-over ledger)

Refactoring resumes in Sprint-1. These are the explicitly-deferred items from Sprint-0, grouped and pre-prioritized so Sprint-1 planning starts from a real list rather than a re-audit:

**Refactoring (the resuming thread)**
- **Cross-app `format-utils` duplication** — `ui/` and `web-server/` each carry their own copy; the only remaining dedup target called out in iteration 2's Notes. Decide on a shared location or accept the split deliberately.
- Re-audit for any new god-handlers/components that have grown since the initial audit (the three biggest are now resolved).

**Security (non-refactor, from the original audit — never in scope for Sprint-0's refactor track)**
- CORS `*.vercel.app` wildcard tightening.
- Auth-route ownership checks (verify a user owns the account they're acting on).
- (AES-256-GCM secrets — already Done per BG-001; confirm during closeout.)

**Testing expansion (cheap follow-ups on the harnesses just built)**
- **BG-014** — backend `format-utils` + `BrokerFactory` tests on the new Vitest config.
- Remaining trading cards (`Funds`/`Holdings`/`Positions`) + `AccountSelector` on the MSW + `renderWithProviders` harness — mechanical now that the infra exists.

**Operational**
- Decide whether `scripts/deactivate-kite-accounts.ts` needs to be run against the production DB (it was created but its run-status against a live DB is unconfirmed) — then retire the script.

---

## Verification

1. `cd ui && npm run test && npx tsc --noEmit` — green (baseline: 61 tests).
2. `cd web-server && npm run test && npm run type-check && npm run build` — green (baseline: 15 tests).
3. `git status` clean after doc commits.
4. Backlog statuses match reality (BG-015/BG-016 Done; carry-over items present and accurately To Do).

## Notes

- Bookkeeping only — no production code touched this sprint.
- The carry-over ledger is the authoritative handoff; Sprint-1 planning should start there, lead with the refactoring thread (per the decision to "return to refactoring in Sprint 1"), and fold the testing-expansion items in as low-risk companions.
- Known unmitigated risk to flag in Sprint-1: all broker interactions are mocked in tests — there is still no live/integration smoke harness. Not blocking, but worth a conscious decision before relying on the suite as a safety net for execution-path changes.

---

## Retrospective

### What Went Well
- **Incremental commits & per-iteration verification:** Checking in code and immediately verifying it per iteration allowed for quick debugging and minimized regressions.
- **Mutation checks:** The mutation checks performed during test verification (such as swapping parameters or toggling conditional flags) caught real gaps in test assertions, ensuring that the tests were robust and not just passing superficially.

### Carrying Forward as Process
- **Balanced Workloads:** Each refactoring iteration paired a complex/heavy component change with a lighter one, preventing developer fatigue and keeping code review scopes manageable.
- **Testing Guardrails:** Ending every testing sprint with a mutation sanity check should be codified as a rule to verify the fidelity of the test assertions.

### Remaining Unmitigated Risks
- **No live integration smoke tests:** Currently, all broker APIs and WebSocket connections are fully mocked. We have no runtime integration sanity checks against the live Sandbox or production endpoints of Binance or Upstox. This remains an unmitigated risk that should be evaluated in subsequent sprints before implementing execution-path modifications.
