# Spikey Coins - AI Agent Handbook

Welcome, Agent! This guide outlines the codebase structure, engineering design patterns, and standards you must follow when working in the Spikey Coins repository.

---

## 📂 Repository Structure

Spikey Coins is a monorepo consisting of:
*   **`ui/`**: Frontend React application built with Next.js 14+ (App Router), Tailwind CSS, Radix UI, and TypeScript.
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
*   **Binance Price Service:** [binance-price-service.ts](file:///home/ubuntu/code/spikeycoins/web-server/src/lib/binance-price-service.ts) caches prices from Binance Futures. It uses exponential backoff reconnection logic to ensure stability under network drops.
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

## 📚 Further Reading

*   [Roadmap](docs/ROADMAP.md) — Project phases and milestones
*   [Backlog](docs/BACKLOG.md) — Prioritized engineering task list
