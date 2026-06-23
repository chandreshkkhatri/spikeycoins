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
| **BG-017** | Security | Tighten CORS: replace the `*.vercel.app` wildcard origin with an explicit allow-list. Deferred from the Sprint-0 audit. | `web-server` / config | 🟥 To Do |
| **BG-018** | Security | Add auth-route ownership checks — verify the authenticated user owns the `accountId` they act on. Deferred from the Sprint-0 audit. | `web-server` / `routes` | 🟥 To Do |

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
| **BG-019** | Tech Debt | De-duplicate `format-utils` across `ui/` and `web-server/` — decide on a shared location or accept the split deliberately. Last dedup target deferred from Sprint-0 refactor iteration 2. | `ui` / `web-server` | 🟥 To Do |
| **BG-020** | Testing | Extend integration tests to the remaining trading cards (`Funds`/`Holdings`/`Positions`) and `AccountSelector` on the MSW + `renderWithProviders` harness built in BG-015. | `ui` / Tests | 🟥 To Do |

---

## 🟢 Low Priority

| ID | Category | Task Description | Target Component | Status |
|---|---|---|---|---|
| **BG-011** | Mobile | Setup Capacitor configurations to build initial iOS/Android apps. | `ui` / PWA | 🟥 To Do |
| **BG-012** | Alerts | Add Discord and Telegram notification alerts integration. | `web-server` / Alerts | 🟥 To Do |
| **BG-013** | Integration| Add Angel One (SmartAPI) broker integration to BrokerFactory. | `web-server` / `lib` | 🟥 To Do |
| **BG-014** | Tech Debt | Set up comprehensive unit tests using Vitest for `format-utils` and `BrokerFactory` — unblocked by BG-016. | `web-server` / Tests | 🟥 To Do |
| **BG-021** | Tech Debt | Decide whether `scripts/deactivate-kite-accounts.ts` must run against the production DB, then run + retire it. Operational carry-over from Kite removal. | `scripts` / Database | 🟥 To Do |

---

## ⚙️ How to Add Items
To add items to this backlog:
1. Assign a unique sequential ID (`BG-XXX`).
2. Label the priority correctly:
   - 🔴 **High Priority**: Immediate security issues, connection reliability, or critical UI blocks.
   - 🟡 **Medium Priority**: Core user features, UI improvement suggestions, performance enhancements.
   - 🟢 **Low Priority**: Future roadmap expansions, secondary integrations, non-blocking technical debt.
3. Define the component target (`ui`, `web-server`, `database`, `lib`, etc.) and set status to `To Do`.
