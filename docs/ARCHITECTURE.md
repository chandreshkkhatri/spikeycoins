# Spikey Coins — System Architecture

This document describes the high-level design of Spikey Coins: the multi-broker trading platform unifying Upstox and Binance into a single dashboard.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js 16 + React 19)          │
│  Dashboard | Watchlists | Trading | Orders | Journal | Charts│
├─────────────────────────────────────────────────────────────┤
│  Centralized API Client (axios) + Context State Management  │
│  Auth | Account Selection | Live Price Streams | Orders     │
└─────────────────┬───────────────────────────────────────────┘
                  │ /api (proxied or NEXT_PUBLIC_API_URL)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Express + Node.js)                 │
│  ┌─────────────────────────────────────────────────────────┤
│  │ API Routes (20 modules): accounts, trading, orders,     │
│  │ positions, holdings, funds, prices, watchlist, journal  │
│  └─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┤
│  │ Unified Broker Client Layer (BrokerFactory pattern)     │
│  │  • Upstox Service (Upstox JS SDK)                       │
│  │  • Binance Service (Spot + Futures via @binance/cli)   │
│  └─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┤
│  │ WebSocket Services (Real-time data & monitoring)        │
│  │  • BinancePriceService: Futures ticker (24hr stream)   │
│  │  • BinanceOrderMonitor: Order fill tracking + SL/TP    │
│  │  • Upstox: OAuth-gated market data streams             │
│  └─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┤
│  │ Supporting Services                                      │
│  │  • JournalSyncService: Binance fill → DB trade history │
│  │  • EncryptionService: AES-256-GCM API key at-rest      │
│  │  • PushNotificationService: Web push (VAPID)            │
│  │  • DemoAccountService: Testnet trading (optional)       │
│  └─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┤
│  │ MongoDB (14 models)                                      │
│  │  Users, Accounts, Sessions, Watchlists, Trades          │
│  │  Candles, Research, Journal, Settings, Invites, etc.   │
│  └─────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────┘
```

---

## Core Architecture Patterns

### 1. Unified Broker Client Layer (BrokerFactory)

**File**: [web-server/src/lib/broker-factory.ts](../web-server/src/lib/broker-factory.ts)

All broker SDK interactions go through the `BrokerFactory`, which:
- Takes an account record (with encrypted credentials)
- Returns a unified client instance (Upstox or Binance)
- Handles credentials decryption on-the-fly

**Usage**:
```typescript
// In routes, never instantiate brokers directly
const upstoxClient = BrokerFactory.getUpstoxClient(account);
const binanceClient = BrokerFactory.getBinanceClient(account);
```

**Broker-Specific SDKs**:
- **Upstox** (`upstox-js-sdk` npm package): Upstox's official SDK
- **Binance** (`@binance/connector` npm package): Official Binance connector

Each service wraps its SDK:
- [BinanceService](../web-server/src/lib/binance-service.ts): Spot + Futures order placement, position queries
- [UpstoxService](../web-server/src/lib/upstox-service.ts): Upstox order & position management

**Rate Limiting** (Binance): Uses `bottleneck` npm package to track IP weight and queue requests within Binance's 1200 weight/min limit.

---

### 2. WebSocket Services & Real-Time Data

#### 2.1 BinancePriceService (24hr Ticker Stream)

**File**: [web-server/src/lib/binance-price-service.ts](../web-server/src/lib/binance-price-service.ts)

Connects to `wss://fstream.binance.com/ws/!ticker@arr` (Binance Futures), streaming all symbols' 24hr price tickers in real-time.

**Reconnection Logic**:
- Infinite retry on WebSocket close
- Exponential backoff: delay = `initialDelay × 1.5^(attemptNumber-1)`, capped at 2 minutes
- Continuously fetches 5-minute OHLCV candles per symbol (rate-limited, rotates through symbols every 5 sec)
- Stores ticker data in-memory and caches candles in MongoDB

**Used by**: Frontend price display, chart data, alert thresholds.

#### 2.2 BinanceOrderMonitor (Order Fill Tracking)

**File**: [web-server/src/lib/binance-order-monitor.ts](../web-server/src/lib/binance-order-monitor.ts)

Per-account WebSocket listener to Binance User Data Stream. Monitors:
- **Order fills**: Sends push notifications when orders fill
- **SL/TP auto-cancel**: When one order (SL or TP) fills, automatically cancels the other
- **Position updates**: Tracks entry, exit, quantity, margin
- **listenKey renewal**: Refreshes every 30 minutes (per Binance API requirement)
- **Fallback polling**: Every 30 seconds, queries open orders (in case WebSocket orphans an order)

**Used by**: Real-time order tracking, position updates, trade journal synchronization.

#### 2.3 Upstox WebSocket

The Upstox service offers a market data WebSocket stream (gated by OAuth). It is:
- User-initiated (requires account credentials)
- Quote depth & LTP (last-traded-price) updates
- Optional; used only if the user connects an Upstox account

---

### 3. Trade Journal & Execution History

**Files**:
- [JournalSyncService](../web-server/src/lib/journal-sync-service.ts)
- [JournalSync model](../web-server/src/models/journal-sync.ts)
- [JournalTrade model](../web-server/src/models/journal-trade.ts)

Every time a Binance futures order fills, the `BinanceOrderMonitor` triggers `JournalSyncService.syncFills()`:

1. Fetches all fills from Binance for that symbol & position side (within a time window)
2. Computes net quantity, average entry/exit price, P&L
3. Upserts a `JournalTrade` record (one per symbol per position side per cycle)
4. Records sync metadata (`JournalSync`) for resumability on outages

This creates a searchable, timestamped trade history viewable in the "Journal" tab.

---

### 4. Authentication & Authorization

**Middleware**: [web-server/src/lib/auth-middleware.ts](../web-server/src/lib/auth-middleware.ts)

- `requireAuth`: Verifies JWT session token; attaches `req.user` to request
- `requireAccountAccess`: Validates that the requested account belongs to the user; attaches `req.account` to request

All routes that touch broker assets must use both:
```typescript
router.get(
  "/positions",
  requireAuth,
  requireAccountAccess,
  asyncHandler(async (req, res) => {
    // req.user and req.account are now safe
  })
);
```

**Session Management**:
- JWT stored in HTTP-only cookies (secure in production)
- Refresh token rotation: each refresh generates a new token
- Multi-session support: user can have multiple active sessions

---

### 5. Data Encryption & Security

**File**: [web-server/src/lib/encryption.ts](../web-server/src/lib/encryption.ts)

API keys and secrets are **encrypted at rest** using AES-256-GCM:
- Encryption key: `ENCRYPTION_KEY` env var (must be 32-byte hex)
- When storing: `encrypt(plaintext)` → ciphertext + IV + auth tag
- When retrieving: `decrypt(ciphertext)` → plaintext
- Decryption happens on-demand when broker services are instantiated

Never log or return plaintext credentials.

---

### 6. MongoDB Data Model

**Models** (14 total in [web-server/src/models/](../web-server/src/models/)):

| Model | Purpose |
|-------|---------|
| `User` | User profiles, OAuth identity |
| `Account` | Broker account (Upstox/Binance) with encrypted credentials |
| `RefreshToken` | Token rotation for JWT refresh flow |
| `Watchlist` | Per-account symbol watchlists |
| `JournalTrade` | Trade history (entry/exit, P&L, filled fills) |
| `JournalSync` | Metadata for journal syncing (resumability) |
| `Instrument` | Symbol metadata (exchange, lot size, tick size) |
| `GymSession` | Paper trading (backtesting) session |
| `HistoricalDataCache` | Cached candles (reduces external API calls) |
| `PushSubscription` | Browser push notification subscriptions (VAPID) |
| `UserSettings` | Per-user preferences (theme, notifications, etc.) |
| `AppConfig` | Global app config (feature flags, API keys for shared services) |
| `Invite` | Signup invite codes |

---

### 7. Frontend Architecture (Next.js App Router)

**Key Files**:
- [src/lib/api.ts](../ui/src/lib/api.ts): Centralized axios client with token refresh interceptor
- [src/contexts/](../ui/src/contexts/): Auth, Account, TradingData contexts
- [src/components/](../ui/src/components/): Feature components (trading, orders, positions, journal, etc.)
- [src/app/](../ui/src/app/): Next.js App Router structure

**State Management**:
1. **AuthContext**: User login state, JWT token
2. **AccountContext**: Active account, list of accounts
3. **TradingDataContext**: Live price streams, order updates

**Offline Support**:
- 5-minute candlestick data stored in IndexedDB
- On reconnect, app syncs gaps via the backend
- PWA manifest enables home screen installation

---

### 8. Async Error Handling

All async route handlers must be wrapped in `asyncHandler`:

```typescript
import asyncHandler from "../lib/async-handler";

router.get("/my-endpoint", asyncHandler(async (req, res) => {
  // Unhandled promise rejections are now caught
}));
```

Express 4 doesn't catch promise rejections in route handlers, so this wrapper ensures they become `500` responses instead of crashing the process.

---

## Deployment Architecture

### Environment Variables

**Backend** ([.env.example](../web-server/.env.example)):
- `PORT`: Server port (default 8000)
- `NODE_ENV`: `development` or `production`
- `MONGODB_URI`: MongoDB connection string
- `SESSION_SECRET`: JWT signing secret
- `ENCRYPTION_KEY`: AES-256-GCM key (32 bytes hex)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: OAuth
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: Web push notifications
- `GEMINI_API_KEY`: AI research (optional)
- `DEMO_BINANCE_*`: Demo testnet account (optional)

**Frontend** ([ui/.env.example](../ui/.env.example)):
- `NEXT_PUBLIC_API_URL`: Backend URL (omit for local dev; proxies /api)
- `PORT`: Dev server port (default 3020)

### Build & Run

**Backend**:
```bash
npm run build   # Compiles TypeScript → dist/
npm start       # Runs dist/server.js
```

**Frontend**:
```bash
npm run build   # Next.js production build
npm start       # Serves optimized bundle
```

---

## Scaling Considerations

**Current Architecture**:
- Single backend instance
- MongoDB single replica (or Atlas)
- No caching layer (Redis)
- No message queue (for async jobs)

**Future Scaling**:
- Redis for session storage, price cache, rate limiter state
- Bull queue for background jobs (research cron, journal sync batches)
- Multiple backend instances behind a load balancer
- MongoDB replica set for HA

---

## Security Checklist

- ✅ API keys encrypted at rest (AES-256-GCM)
- ✅ JWT in HTTP-only cookies (secure in prod)
- ✅ CORS allowlist per origin
- ✅ Session & account access control via middleware
- ✅ No plaintext credentials in logs
- ✅ Rate limiting on Binance (IP weight tracking)
- ✅ OAuth 2.0 for Upstox (user-initiated)

---

## Troubleshooting

### BinancePriceService not reconnecting?
Check logs for WebSocket URL, firewall rules for `wss://fstream.binance.com`. Verify `ALLOWED_ORIGINS` includes the frontend URL.

### Journal sync missing trades?
Ensure MongoDB is running and the `JournalSync` collection exists. Check `BinanceOrderMonitor` logs for fill events. Verify account has active User Data Stream (`listenKey`).

### SL/TP not auto-cancelling?
Verify the `BinanceOrderMonitor` is instantiated when the account is loaded. Check Binance API key has `Future` permission. Monitor order fill notifications.

---

## See Also

- [Contributing Guidelines](../CONTRIBUTING.md) — Code standards, PR workflow
- [Backend README](../web-server/README.md) — API reference
- [Frontend README](../ui/README.md) — UI setup & architecture
- [Roadmap](./ROADMAP.md) · [Backlog](./BACKLOG.md)
