# Spikey Coins - Frontend UI

Modern React/Next.js frontend for the unified multi-broker trading platform. Built with Next.js 16 (App Router), React 19, Tailwind CSS, and Radix UI components.

## Features

- **Real-time Trading Dashboard**: Monitor positions, orders, and holdings across Zerodha Kite, Upstox, and Binance in a unified interface.
- **Advanced Charting**: TradingView Lightweight Charts with 5-minute candlestick data and offline IndexedDB caching.
- **Watchlist Management**: Create and manage symbol watchlists across multiple accounts and brokers.
- **PWA Support**: Installable offline web app with IndexedDB candle cache for offline viewing.
- **Responsive Design**: Mobile-friendly Tailwind CSS + Radix UI component library.

## Getting Started

### Installation

```bash
cd ui
npm install
```

### Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` — set `NEXT_PUBLIC_API_URL` **only if the backend is non-local**. For local development (backend on the same host), omit it; the app proxies `/api` to the development backend.

```env
# Local dev (backend on same host): omit or set to empty
# NEXT_PUBLIC_API_URL=

# Staging/prod: point to your backend server
NEXT_PUBLIC_API_URL=http://api.example.com

# Dev server port (default 3000, but we override to 3020)
PORT=3020
```

### Development Server

```bash
npm run dev
```

Opens at `http://localhost:3020` (configurable via `PORT` env var). Hot reload enabled via Next.js.

**Note:** The dev server is launched through a custom `scripts/dev.mjs` wrapper that sets up environment variables and port handling.

### Build & Production

```bash
npm run build
npm start
```

## Project Structure

```
ui/
├── src/
│   ├── app/                    # Next.js App Router (route groups)
│   │   ├── (auth)/             # Auth flows (login, google callback)
│   │   ├── (routes)/           # Main app routes
│   │   │   ├── dashboard       # Portfolio overview
│   │   │   ├── [accountId]/    # Account-specific views (positions, orders, etc.)
│   │   │   └── ...
│   │   └── (terminal)/         # Advanced trading terminal
│   ├── components/             # Feature & UI components
│   │   ├── layout/             # Nav, sidebar, modals
│   │   ├── trading/            # Order placement, order management
│   │   ├── positions, holdings, orders, watchlist, journal
│   │   ├── accounts, notifications, funds, crypto
│   │   └── ui/                 # Radix UI wrappers (button, dialog, select, etc.)
│   ├── contexts/               # React Context API state
│   │   ├── auth-context.ts     # User login state
│   │   ├── account-context.ts  # Account selection & data
│   │   └── trading-data.ts     # Live price streams, orders
│   ├── lib/
│   │   ├── api.ts              # Centralized axios client (token refresh, interceptors)
│   │   ├── constants.ts        # App-wide constants
│   │   └── utils.ts
│   └── public/                 # Static assets, PWA manifest
├── .env.example
├── .env
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
└── README.md
```

## Key Technologies

- **Framework**: Next.js 16 with App Router
- **UI Library**: React 19.2.3, Radix UI
- **Styling**: Tailwind CSS 3.4.19
- **State**: React Context API (auth, accounts, trading data)
- **HTTP Client**: Axios with token refresh interceptor
- **Charts**: TradingView Lightweight Charts 5.1.0
- **Data Tables**: TanStack React Table 8.21.3
- **Icons**: Lucide React

## Architecture Notes

### Centralized API Client
All API calls route through `src/lib/api.ts` — a single axios instance with:
- Base URL proxying to `/api` (or `NEXT_PUBLIC_API_URL` for non-local backends)
- Token refresh interceptor (401 → refresh token → retry)
- Request queuing during token refresh to prevent race conditions

### State Management
Three main Context providers:
- **AuthContext** (`useAuth`): User login state, JWT token
- **AccountContext** (`useAccount`): Active account selection, account list
- **TradingDataContext** (`useTradingData`): Live price streams, order/position updates

Components stabilize context references during background refreshes to avoid abort-and-restart cycles.

### Offline Support
5-minute candlestick data is cached in IndexedDB. On reconnect, the app syncs any gaps via the backend. The PWA manifest enables home screen installation on mobile.

## Development Workflow

1. **Type Safety**: Before submitting, run type checks:
   ```bash
   npm run type-check  # or tsc --noEmit
   ```

2. **Linting**:
   ```bash
   npm run lint
   ```

3. **Create a feature**: Add components in `src/components/<feature>/`, context if needed in `src/contexts/`, and routes in `src/app/`.

4. **Testing**: Use Jest / Vitest (not yet set up, but encouraged for future PRs).

## Documentation & Support

- [Root README](../README.md) — Project overview, setup, features
- [Backend API Reference](../web-server/README.md) — Endpoint documentation
- [Architecture Guide](../docs/ARCHITECTURE.md) — System design, broker layer, WebSocket services
- [Contributing Guidelines](../CONTRIBUTING.md) — Code standards, PR workflow

For issues, check the [Roadmap](../docs/ROADMAP.md) and [Backlog](../docs/BACKLOG.md).
