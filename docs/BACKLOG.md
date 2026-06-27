# Spikey Coins - Product Backlog

This backlog lists prioritized engineering tasks, bugs, and feature requests.

---

## 🔴 High Priority

| ID | Category | Task Description | Target Component | Status |
|---|---|---|---|---|
| **BG-001** | Security | Encrypt all stored API keys & secrets in MongoDB using AES-256-GCM. | `web-server` / Database | ✅ Done |
| **BG-002** | Execution | Implement server-side tracking of Trailing Stop Loss logic. | `web-server` / `lib` | 🟥 To Do |
| **BG-003** | Execution | Build external webhook trade execution endpoint (for TradingView alerts integration). | `web-server` / `routes` | 🟥 To Do |
| **BG-004** | UI/UX | Persist user sorting preferences in the Screener across browser refreshes. | `ui` / Screener | 🟥 To Do |
| **BG-005** | Performance| Implement connection heartbeat monitoring for Upstox WebSocket streams. | `web-server` / WebSocket | 🟥 To Do |
| **BG-017** | Security | Tighten CORS: replace the `*.vercel.app` wildcard origin with an explicit allow-list. Deferred from the Sprint-0 audit. See [sprint-1-iteration-1.md](sprints/sprint-1-iteration-1.md). | `web-server` / config | ✅ Done |
| **BG-018** | Security | Auth-route ownership checks — verify the authenticated user owns the `accountId` they act on. Already enforced by `requireAccountAccess` (`auth-middleware.ts`) across account routes + inline in `historical-data.ts`; confirmed during Sprint-1 planning. | `web-server` / `routes` | ✅ Done |

---

## 🟡 Medium Priority

| ID | Category | Task Description | Target Component | Status |
|---|---|---|---|---|
| **BG-006** | Analytics | Implement automated trade journal syncing to save execution history. | `web-server` / MongoDB | ✅ Done |
| **BG-007** | UI/UX | Integrate standard drawing tools (Trendlines, Fibonacci) into MultiTimeframeChart. | `ui` / Charts | 🟥 To Do |
| **BG-008** | Analytics | Build initial Win Rate / Sharpe Ratio calculation modules. | `web-server` / Analytics | 🟥 To Do |
| **BG-009** | Gym | Support loading multi-day historical data for replay simulation backtesting. | `web-server` / Gym | 🟥 To Do |
| **BG-010** | UI/UX | Improve toast notification layout for real-time order fill alerts. | `ui` / Layout | 🟥 To Do |
| **BG-015** | Testing | Add MSW (Mock Service Worker) + a custom RTL `render` wrapper that injects `AuthContext`/`AccountContext`, then write integration tests for `useWatchlist.ts` and the trading cards — the highest-risk, most recently AI-refactored UI paths. See [sprint-0-summary.md](sprints/sprint-0-summary.md). | `ui` / Tests | ✅ Done |
| **BG-016** | Testing | Stand up Vitest for `web-server` and write the first backend test for `binance-futures-order.service.ts` (DI-mocked `BinanceService`). Unblocks BG-014. See [sprint-0-summary.md](sprints/sprint-0-summary.md). | `web-server` / Tests | ✅ Done |
| **BG-019** | Tech Debt | ~~De-duplicate `format-utils` across `ui/` and `web-server/`~~ — Sprint-1 planning confirmed the two files share **zero** functions (UI = display formatters, backend = API normalizers); not actually duplicated. Optional: rename `web-server/format-utils` for clarity. | `ui` / `web-server` | ⬜ Won't Do |
| **BG-020** | Testing | Extend integration tests to the remaining trading cards (`Funds`/`Holdings`/`Positions`) and `AccountSelector` on the MSW + `renderWithProviders` harness built in BG-015. See [sprint-1-iteration-2.md](sprints/sprint-1-iteration-2.md). | `ui` / Tests | ✅ Done |
| **BG-022** | Tech Debt | Dedup the four trading cards' data-fetching into a shared `useAccountCardData` hook (each repeats ~6 `useState` + fetch/401/error machine). See [sprint-1-iteration-1.md](sprints/sprint-1-iteration-1.md). | `ui` / `components` | ✅ Done |
| **BG-023** | Tech Debt | Split the 936-line `auth.ts` into `routes/auth/{user,google,session,upstox,binance}.ts` by concern (behavior-preserving move). See [sprint-1-iteration-2.md](sprints/sprint-1-iteration-2.md). | `web-server` / `routes` | ✅ Done |
| **BG-024** | Tech Debt | Extract a `useTradingWindow` hook from the 2800-line `TradingWindow.tsx` (33 `useState`/11 `useEffect`/31 handlers). Hook and component kept in the same file (deviates from the `useWatchlist` separate-file pattern — see [sprint-2-summary.md](sprints/sprint-2-summary.md)). | `ui` / `components` | ✅ Done |
| **BG-025** | Tech Debt | Reduce `any`-type debt in `binance-futures.service.ts` (33), `upstox-service.ts` (27), `trading.ts` (21). Mechanical `catch (error: any)`/cache-container tier shipped (~30 of 81 — verified via `tsc`, zero new lint issues vs. baseline); remaining signature-level Upstox/Binance shape typing split out as BG-027. See [sprint-1-iteration-3.md](sprints/sprint-1-iteration-3.md). | `web-server` / `lib` | ✅ Done |
| **BG-026** | Tech Debt | Consolidate the repeated "generate access+refresh token → persist `RefreshToken`" sequence (`register`/`login`/google-callback — 3 identical sites in `routes/auth/`) into a shared `issueSession(user)` helper in `auth-middleware.ts`. `/refresh`'s token-rotation path is structurally different (grace-period reuse logic) and stays separate. Tokens return via JSON body or redirect params — no cookies are involved (corrects the original description). See [sprint-2-summary.md](sprints/sprint-2-summary.md). | `web-server` / `routes` | ✅ Done |
| **BG-027** | Tech Debt | Model real Upstox API v2 response/request shapes (funds, positions, holdings, orders, quote/LTP/OHLC, place/modify/cancel-order params, profile, historical candles — ~15 of `upstox-service.ts`'s 27 `any`s) and propagate through `trading.ts`'s consuming `.map`/`.filter` callbacks. The remaining ~9 SDK-boundary `any`s (`upstox-js-sdk` is untyped CommonJS) are out of scope without vendoring SDK type defs. Spun out of BG-025 during iteration-3 planning — too large to bundle with the mechanical tier. See [sprint-2-summary.md](sprints/sprint-2-summary.md). | `web-server` / `lib` | ✅ Done |
| **BG-028** | Testing | Write integration test coverage for `TradingWindow.tsx` (2800 lines, 33 hooks, real order-entry path) capturing its *current* behavior — order placement, validation, leverage, SL/TP, retry-on-fail. 14 tests added (including the "no account selected" branch); safety net for BG-024's extraction. See [sprint-2-summary.md](sprints/sprint-2-summary.md). | `ui` / Tests | ✅ Done |
| **BG-029** | Performance | Implement multi-tenant rate-limit fair-share estimation and caching to prevent user starvation on the shared Binance IP rate-limit budget. | `web-server` / `lib` | 🟥 To Do |

---

## 🟢 Low Priority

| ID | Category | Task Description | Target Component | Status |
|---|---|---|---|---|
| **BG-011** | Mobile | Setup Capacitor configurations to build initial iOS/Android apps. | `ui` / PWA | 🟥 To Do |
| **BG-012** | Alerts | Add Discord and Telegram notification alerts integration. | `web-server` / Alerts | 🟥 To Do |
| **BG-013** | Integration| Add Angel One (SmartAPI) broker integration to BrokerFactory. | `web-server` / `lib` | 🟥 To Do |
| **BG-014** | Tech Debt | Set up comprehensive unit tests using Vitest for `format-utils` and `BrokerFactory` — unblocked by BG-016. See [sprint-1-iteration-3.md](sprints/sprint-1-iteration-3.md). | `web-server` / Tests | ✅ Done |
| **BG-021** | Tech Debt | Decide whether `scripts/deactivate-kite-accounts.ts` must run against the production DB, then run + retire it. Operational carry-over from Kite removal. Script deleted; stale Kite rows cleaned up manually against the live DB (outside the codebase). See [sprint-1-iteration-3.md](sprints/sprint-1-iteration-3.md). | `scripts` / Database | ✅ Done |
| **BG-030** | Scaling | Implement outbound IP rotation or proxy configuration for Binance API queries to expand rate limits under scale. | `web-server` / `lib` | 🟥 To Do |

---

## ⚙️ How to Add Items
To add items to this backlog:
1. Assign a unique sequential ID (`BG-XXX`).
2. Label the priority correctly:
   - 🔴 **High Priority**: Immediate security issues, connection reliability, or critical UI blocks.
   - 🟡 **Medium Priority**: Core user features, UI improvement suggestions, performance enhancements.
   - 🟢 **Low Priority**: Future roadmap expansions, secondary integrations, non-blocking technical debt.
3. Define the component target (`ui`, `web-server`, `database`, `lib`, etc.) and set status to `To Do`.
