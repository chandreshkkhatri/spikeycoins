# Spikey Coins - AI Agent Handbook

Welcome, Agent! This guide outlines the codebase structure, engineering design patterns, and standards you must follow when working in the Spikey Coins repository.

---

## 📂 Repository Structure

Spikey Coins is a monorepo consisting of:
*   **`ui/`**: Frontend React application built with Next.js 16 (App Router), Tailwind CSS, Radix UI, and TypeScript.
*   **`web-server/`**: Backend REST API built with Node.js, Express, TypeScript, and MongoDB (Mongoose).
*   **`docs/`**: Documentation folder containing roadmaps, backlogs, and developer guides.

```
spikeycoins/
├── docs/                # Project documentation & guides
├── ui/                  # Next.js Frontend
│   └── src/
│       ├── app/         # App router (routes/pages)
│       ├── components/  # Core UI & Feature components
│       └── contexts/    # Shared react contexts (auth, accounts, streams)
└── web-server/          # Express Backend
    └── src/
        ├── lib/         # Broker interfaces, middlewares, and services
        ├── models/      # Mongoose Database models
        └── routes/      # Express API endpoints
```

---

## 🛠️ Core Technical Architecture

### 1. Unified Broker Client Layer
Spikey Coins unifies multiple brokers under a single API surface.
*   **Initialization:** Never instantiate broker API SDKs directly in routes. Instead, always use `BrokerFactory` in [broker-factory.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/broker-factory.ts):
    ```typescript
    const kiteClient = BrokerFactory.getKiteClient(account);
    const upstoxClient = BrokerFactory.getUpstoxClient(account);
    const binanceClient = BrokerFactory.getBinanceClient(account);
    ```
*   **Data Formatting:** Always format responses using the utility helpers in [format-utils.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/format-utils.ts) (e.g., `formatPosition`, `formatOrder`) to ensure consistent JSON formats are sent to the client.

### 2. Backend Authentication & Authorization
Backend routes utilize custom middlewares located in [auth-middleware.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/auth-middleware.ts):
*   `requireAuth`: Ensures a user session exists.
*   `requireAccountAccess`: Validates that the requested broker account belongs to the user, then attaches `req.account` to the request object.
*   **Async Route Wrapping:** Since Express 4 does not catch unhandled promise rejections, all async endpoints must be wrapped inside `asyncHandler`:
    ```typescript
    router.get("/my-route", requireAuth, requireAccountAccess, asyncHandler(async (req, res) => {
      // Async business logic here
    }));
    ```

### 3. Price Feeds & WebSockets
*   **Binance Price Service:** [binance-price-service.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/binance-price-service.ts) caches 24hr ticker prices from Binance Futures WebSocket. It uses infinite retry logic with exponential backoff (capped at 2 minutes per attempt) to ensure stability under network drops.
*   **Client Connections:** Live prices are pushed to the frontend via active WebSocket connections, using local storage state index validation on components to prevent state/visual synchronization mismatches.

---

## 📝 Rules of Engagement

1.  **Strict Type Safety:**
    *   Never use `any` types where possible. Always define appropriate TypeScript interfaces.
    *   Before concluding your work, verify types pass in both the backend and frontend:
        ```bash
        cd web-server && npm run type-check
        cd ../ui && npm run type-check
        ```
2.  **Middlewares & Security:**
    *   Ensure all new endpoints that interact with broker assets or user portfolios enforce `requireAuth` and `requireAccountAccess`.
    *   Do not write credentials or secret keys to output logs.
3.  **Frontend State Stabilization:**
    *   When fetching account details, stabilize the references in `account-context` during background refreshes to avoid abort-and-restart cycles in funds polling.
    *   Always utilize the unified context states (`useAuth`, `useAccount`, and `useTradingData`) for page components rather than fetching ad-hoc data.

---

---

## 📊 Sprint Organization & Deliverables

Spikey Coins is organized in **sprints**. Each sprint has:

1. **Scope Definition**: Clear list of features, fixes, or refactorings (from the [Backlog](docs/BACKLOG.md))
2. **Implementation**: Code changes with type safety, middleware enforcement, and state stabilization
3. **Documentation**: Update relevant docs (README, architecture, guides) to reflect new features
4. **Verification**: Run tests, type-check, lint, and manually test the UI

### Current Status: Sprint 0

**What's Done** (as of June 2026):
- ✅ Multi-broker unification (Kite, Upstox, Binance) via BrokerFactory
- ✅ Real-time price feeds via Binance WebSocket with infinite retry + exponential backoff
- ✅ Order execution with SL/TP auto-cancellation logic
- ✅ API key encryption at rest (AES-256-GCM)
- ✅ Trade journal auto-sync from Binance fills
- ✅ PWA support with offline IndexedDB candle cache
- ✅ Centralized API client on frontend with token refresh
- ✅ Authentication via OAuth 2.0 (Google, Kite, Upstox)
- ✅ Multi-session support with refresh token rotation

### Future Sprints

Each sprint will:
1. Pick 3-5 items from the [Backlog](docs/BACKLOG.md)
2. Estimate effort (small/medium/large)
3. Document completion in this handbook and backlog
4. Update [Roadmap](docs/ROADMAP.md) if timeline changes

**Backlog Items** (next sprint candidates):
- BG-002: Trailing Stop Loss tracking
- BG-003: TradingView webhook integration
- BG-004: Screener sorting persistence
- BG-005: Upstox WebSocket heartbeat monitoring

When picking backlog items, prioritize:
1. **Security**: Any auth/encryption/key management issues
2. **Reliability**: WebSocket reconnection, error handling, data sync
3. **User Impact**: Features that improve trading experience

---

## 📚 Further Reading

*   [Architecture](docs/ARCHITECTURE.md) — System design, broker layer, WebSocket services, data models
*   [Roadmap](docs/ROADMAP.md) — Project phases and milestones
*   [Backlog](docs/BACKLOG.md) — Prioritized engineering task list
*   [Backend README](web-server/README.md) / [Quickstart](web-server/QUICKSTART.md) — API reference
*   [Frontend README](ui/README.md) — UI setup & state management
