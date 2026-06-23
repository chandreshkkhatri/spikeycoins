# Plan: Sprint-2 — TradingWindow safety net + remaining tech debt

## Context

Sprint-1 (3 iterations) is complete: CORS hardened, the four trading cards deduped into `useAccountCardData` + tested, `auth.ts` split by concern, backend tests added for `format-utils`/`BrokerFactory`, the mechanical `any`-reduction tier shipped, the Kite migration script retired. `docs/BACKLOG.md` is current.

What's left, grounded against the actual code rather than the one-line backlog estimates:

- **BG-024** — extract `useTradingWindow` from [`TradingWindow.tsx`](../../ui/src/components/watchlist/TradingWindow.tsx): confirmed **2800 lines**, **33 `useState`/`useEffect`/`useCallback`/`useMemo`/`useRef` hooks**, 11 handler functions, on the **order-entry money path** (real trade placement, SL/TP, leverage, retry-on-fail). Confirmed via `find`: **zero existing tests** for this component — no `TradingWindow.test.*` anywhere in the repo. This is the single highest-value, highest-risk item left. Sprint-1's own notes flagged it should wait for the BG-020 card-testing harness to mature — that's now true, but the component itself still has no safety net of its own. Extracting a 2800-line hook on an untested real-money path without first capturing its current behavior would be reckless, not "heavy but doable."
- **BG-026** — consolidate token-issuance in `routes/auth/`. Re-grounded by reading the actual sites: `user.ts` (`/register`, `/login`), `google.ts` (`/google/callback`) all repeat the identical 3-line block (`generateToken` + `generateRefreshToken` + `RefreshToken.create(...)`). `user.ts`'s `/refresh` is **not** a clean 4th copy — it has token-rotation-with-grace-period logic (mark-old-as-replaced, return-existing-on-reuse-within-grace-period) that only partially overlaps. The backlog's "→ set cookies" framing is **inaccurate** — this app returns tokens in the JSON body (register/login) or as redirect URL params (google callback), never cookies; corrected below.
- **BG-027** — model real Upstox API v2 shapes. Already deeply scoped during Sprint-1 iteration-3 planning: ~15 of `upstox-service.ts`'s 27 `any`s are genuinely modelable (our own `fetch()`-based methods + 3 SDK param shapes), cascading into `trading.ts` and 5 other route files; ~9 are SDK-boundary `any`s (untyped `upstox-js-sdk`) that stay as-is.
- **Noted, still not scoped** (carried over from Sprint-1, no new evidence of friction): `MultiTimeframeChart.tsx` (1792 lines), `TradingPanelTabs.tsx` (1483 lines), `trading-data-context.tsx` (882 lines), `ResearchService.ts` (922 lines). Leave as Sprint-3+ candidates unless they start causing problems.

## Scope (recommended sequence)

### Iteration 1 — backend cleanup (light + medium, low-risk, no new test gaps)
1. **BG-026 — `issueSession` helper** *(light, lead)* — see [sprint-2-iteration-1.md](sprint-2-iteration-1.md) for the exact shared shape and which 3 sites it replaces.
2. **BG-027 — Upstox API typing** *(medium)* — model the ~15 fixable response/param shapes; verified by `tsc` + existing route-level coverage, same low-risk profile as BG-025's mechanical tier (no new tests required, just type tightening with the compiler as the safety net).

### Iteration 2 — TradingWindow safety net *(new item, not yet in BACKLOG.md — file as BG-028)*
3. **BG-028 — `TradingWindow.tsx` test coverage** *(medium-heavy, frontend)* — capture the component's *current* behavior before touching it: order placement (market/limit, buy/sell), validation errors, leverage slider, SL/TP toggle inputs, the retry-on-fail flow. This is the direct analogue of BG-016/BG-022 unblocking BG-014/BG-025 in Sprint-1 — tests first, refactor second.

### Iteration 3 — the extraction itself
4. **BG-024 — extract `useTradingWindow`** *(heavy)* — now safety-netted by BG-028, mirroring the proven `useWatchlist` extraction pattern. Close with a mutation check on the highest-value behavior (e.g., order-submission payload construction).

## Out of scope / deferred
- `MultiTimeframeChart.tsx`, `TradingPanelTabs.tsx`, `trading-data-context.tsx`, `ResearchService.ts` — no scoped work, revisit if friction appears.
- Feature backlog (BG-002–BG-013 not yet done) — separate roadmap track, not tech-debt/hardening.

## Notes
- BG-026's backlog description will need a wording correction when filed (no cookies are actually set in the current auth flow) — done as part of iteration 1's BACKLOG.md update, not a separate step.
- Keep the same process habits as Sprint-1: ground every estimate against the source before planning, mutation-check new test suites, behavior-preserving diffs for refactors, no autonomous DB/destructive actions.
