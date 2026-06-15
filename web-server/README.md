# Spikey Coins Express Backend

Express backend for the Spikey Coins trading platform.

## Features

- **RESTful API** for trading operations
- **Multi-broker support** (Kite, Upstox, Binance)
- **MongoDB** for data persistence
- **TypeScript** for type safety
- **Rate limiting** for API calls
- **Session management** for OAuth flows

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- MongoDB (local or remote)
- Trading account credentials (Kite/Upstox/Binance)

### Installation

```bash
cd web-server
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Update the `.env` file with your configuration:
   - MongoDB connection string
   - API keys for trading platforms
   - Session secret
   - CORS allowed origins

### Running the Server

#### Development

```bash
npm run dev
```

Server will start on `http://localhost:8000` with hot reload enabled.

#### Production

```bash
npm run build
npm start
```

#### Debug Mode

```bash
npm run start:debug
```

Server will start with Node.js inspector on port 9229.

### API Endpoints

#### Authentication

- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/logout` - Logout

**Kite Authentication:**

- `GET /api/auth/kite/login?accountId=xxx` - Initiate Kite login
- `POST /api/auth/kite/login` - Get Kite login URL (JSON)
- `GET /api/auth/kite/callback` - Kite OAuth callback
- `GET /api/auth/kite/session` - Check Kite session status

**Upstox Authentication:**

- `GET /api/auth/upstox/login?accountId=xxx` - Initiate Upstox login
- `POST /api/auth/upstox/login` - Get Upstox login URL (JSON)
- `GET /api/auth/upstox/callback` - Upstox OAuth callback

#### Account Management

- `GET /api/accounts?userId=xxx` - Get all accounts for a user
- `POST /api/accounts` - Create a new account
- `GET /api/accounts/:id` - Get account details
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete (deactivate) account

#### Trading Operations

- `GET /api/funds?accountId=xxx` - Get funds/margins
- `GET /api/holdings?accountId=xxx` - Get holdings
- `GET /api/positions?accountId=xxx` - Get positions
- `GET /api/orders?accountId=xxx` - Get orders
- `POST /api/orders/place` - Place a new order
- `PUT /api/orders/modify` - Modify an order
- `DELETE /api/orders/cancel` - Cancel an order

#### Market Data

- `GET /api/historical-data` - Get historical data
- `GET /api/upstox/market-data/ltp` - Get LTP (Upstox)
- `GET /api/upstox/market-data/ohlc` - Get OHLC (Upstox)
- `GET /api/upstox/market-data/quotes` - Get quotes (Upstox)

#### Watchlists

- `GET /api/watchlist?userId=xxx` - Get watchlists
- `POST /api/watchlist` - Create watchlist
- `GET /api/watchlist/symbols?watchlistId=xxx` - Get watchlist symbols

#### Utilities

- `GET /health` - Health check
- `GET /api/search/symbols?query=xxx` - Search symbols

## Project Structure

```
web-server/
├── src/
│   ├── lib/               # Core services & utilities
│   │   ├── broker-factory.ts          # Unified broker client factory
│   │   ├── binance-service.ts         # Binance API client
│   │   ├── binance-price-service.ts   # Binance ticker WebSocket (futures)
│   │   ├── binance-order-monitor.ts   # Binance order fill tracking
│   │   ├── kiteconnect-service.ts     # Zerodha Kite API
│   │   ├── upstox-service.ts          # Upstox API
│   │   ├── encryption.ts              # AES-256-GCM for API keys
│   │   ├── journal-sync-service.ts    # Trade history synchronization
│   │   ├── push-notification-service.ts  # Web push (VAPID)
│   │   ├── auth-middleware.ts         # Session & account access control
│   │   ├── format-utils.ts            # Response formatting helpers
│   │   └── mongodb.ts, limiter.ts, async-handler.ts
│   ├── models/            # MongoDB schemas (14 models)
│   │   ├── account.ts, user.ts, session.ts, refresh-token.ts
│   │   ├── watchlist.ts, journal-trade.ts, journal-sync.ts
│   │   ├── instrument.ts, gym-session.ts, historical-data-cache.ts
│   │   ├── push-subscription.ts, user-settings.ts, app-config.ts, invite.ts
│   ├── routes/            # API endpoints (20 route modules)
│   │   ├── auth.ts, accounts.ts, trading.ts, orders.ts
│   │   ├── positions.ts, holdings.ts, funds.ts, prices.ts
│   │   ├── binance.ts, upstox.ts, watchlist.ts, historical-data.ts
│   │   ├── journal.ts, notifications.ts, settings.ts, gym.ts
│   │   ├── invite.ts, admin.ts, search.ts, db.ts
│   ├── crypto/            # Market data microservice (independent)
│   │   └── (Binance 24hr ticker, candlestick caching, Gemini research)
│   ├── proto/             # Protocol buffers (MarketDataFeed.proto)
│   ├── jobs/              # Background cron jobs (e.g., researchCron)
│   └── server.ts          # Main Express server
├── package.json
├── tsconfig.json
└── .env
```

## Development

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Building

```bash
npm run build
```

Build output will be in the `dist/` directory.

## Environment Variables

| Variable          | Description                            | Default                                     |
| ----------------- | -------------------------------------- | ------------------------------------------- |
| `PORT`            | Server port                            | 8000                                        |
| `NODE_ENV`        | Environment                            | development                                 |
| `MONGODB_URI`     | MongoDB connection string              | mongodb://localhost:27017/spikey-coins      |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | http://localhost:8000,http://localhost:5173 |
| `SESSION_SECRET`  | Session encryption secret              | (required)                                  |

## Security Notes

- API secrets are never sent to the client
- Access tokens are redacted in responses
- HTTPS recommended for production
- Session cookies are httpOnly and secure in production
- CORS is configured to allow only specific origins

## Support

For issues or questions, check the [root README](../README.md), [Architecture guide](../docs/ARCHITECTURE.md), or [Contributing guidelines](../CONTRIBUTING.md).











