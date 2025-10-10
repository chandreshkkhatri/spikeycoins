# Flip Safe Express Backend

Express backend for the Flip Safe trading platform.

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
cd express-code
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

Server will start on `http://localhost:3001` with hot reload enabled.

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
express-code/
├── src/
│   ├── lib/               # Utility libraries
│   │   ├── mongodb.ts     # MongoDB connection
│   │   ├── limiter.ts     # Rate limiter
│   │   ├── kiteconnect-service.ts
│   │   └── upstox-service.ts
│   ├── models/            # MongoDB models
│   │   ├── account.ts
│   │   ├── instrument.ts
│   │   ├── session.ts
│   │   ├── watchlist.ts
│   │   └── simulator.ts
│   ├── routes/            # API route handlers
│   │   ├── accounts.ts
│   │   ├── auth.ts
│   │   ├── funds.ts
│   │   ├── holdings.ts
│   │   ├── orders.ts
│   │   ├── positions.ts
│   │   ├── watchlist.ts
│   │   └── ...
│   └── server.ts          # Main server file
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
| `PORT`            | Server port                            | 3001                                        |
| `NODE_ENV`        | Environment                            | development                                 |
| `MONGODB_URI`     | MongoDB connection string              | mongodb://localhost:27017/flip-safe         |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | http://localhost:3000,http://localhost:5173 |
| `SESSION_SECRET`  | Session encryption secret              | (required)                                  |

## Security Notes

- API secrets are never sent to the client
- Access tokens are redacted in responses
- HTTPS recommended for production
- Session cookies are httpOnly and secure in production
- CORS is configured to allow only specific origins

## Next Steps

To complete the migration from Next.js:

1. ✅ Express backend created
2. ⏳ Create Vite frontend
3. ⏳ Update frontend to call Express API
4. ⏳ Test all API endpoints
5. ⏳ Deploy backend and frontend separately

## Support

For issues or questions, check the main project README or contact the development team.









