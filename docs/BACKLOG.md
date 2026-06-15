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

---

## 🟡 Medium Priority

| ID | Category | Task Description | Target Component | Status |
|---|---|---|---|---|
| **BG-006** | Analytics | Implement automated trade journal syncing to save execution history. | `web-server` / MongoDB | ✅ Done |
| **BG-007** | UI/UX | Integrate standard drawing tools (Trendlines, Fibonacci) into MultiTimeframeChart. | `ui` / Charts | 🟥 To Do |
| **BG-008** | Analytics | Build initial Win Rate / Sharpe Ratio calculation modules. | `web-server` / Analytics | 🟥 To Do |
| **BG-009** | Gym | Support loading multi-day historical data for replay simulation backtesting. | `web-server` / Gym | 🟥 To Do |
| **BG-010** | UI/UX | Improve toast notification layout for real-time order fill alerts. | `ui` / Layout | 🟥 To Do |

---

## 🟢 Low Priority

| ID | Category | Task Description | Target Component | Status |
|---|---|---|---|---|
| **BG-011** | Mobile | Setup Capacitor configurations to build initial iOS/Android apps. | `ui` / PWA | 🟥 To Do |
| **BG-012** | Alerts | Add Discord and Telegram notification alerts integration. | `web-server` / Alerts | 🟥 To Do |
| **BG-013** | Integration| Add Angel One (SmartAPI) broker integration to BrokerFactory. | `web-server` / `lib` | 🟥 To Do |
| **BG-014** | Tech Debt | Set up comprehensive unit tests using Vitest for `format-utils` and `BrokerFactory`. | `web-server` / Tests | 🟥 To Do |

---

## ⚙️ How to Add Items
To add items to this backlog:
1. Assign a unique sequential ID (`BG-XXX`).
2. Label the priority correctly:
   - 🔴 **High Priority**: Immediate security issues, connection reliability, or critical UI blocks.
   - 🟡 **Medium Priority**: Core user features, UI improvement suggestions, performance enhancements.
   - 🟢 **Low Priority**: Future roadmap expansions, secondary integrations, non-blocking technical debt.
3. Define the component target (`ui`, `web-server`, `database`, `lib`, etc.) and set status to `To Do`.
