const API_ROUTES = {
  historicalData: '/api/historical-data',
  funds: '/api/funds',
  db: {
    getMWData: '/api/db/get-mw-data',
    getListOfMW: '/api/db/get-list-of-mw',
  },
  orders: {
    placeOrder: '/api/orders/place',
    modifyOrder: '/api/orders/modify',
    cancelOrder: '/api/orders/cancel',
  },
  alerts: {
    getAlerts: '/api/alerts',
    createAlert: '/api/alerts/create',
    deleteAlert: '/api/alerts/delete',
  },
  ticker: {
    subscribe: '/api/ticker/subscribe',
    unsubscribe: '/api/ticker/unsubscribe',
  },
  trading: {
    getOrders: '/api/trading/orders',
    getPositions: '/api/trading/positions',
    getHoldings: '/api/trading/holdings',
  },
  accounts: {
    list: '/api/accounts',
    getAccounts: '/api/accounts',
    create: '/api/accounts',
    get: (id: string) => `/api/accounts/${id}`,
    update: (id: string) => `/api/accounts/${id}`,
    delete: (id: string) => `/api/accounts/${id}`,
  },
  auth: {
    checkStatus: '/api/auth/status',
    logout: '/api/auth/logout',
  },
  upstox: {
    login: '/api/auth/upstox/login',
    callback: '/api/auth/upstox/callback',
  },
  kite: {
    login: '/api/auth/kite/login',
    callback: '/api/auth/kite/callback',
    session: '/api/auth/kite/session',
  },
} as const;

const API_CONFIG = {
  // Prefer relative URLs so Next.js rewrites can proxy to the backend.
  // Only use NEXT_PUBLIC_API_URL when it points to a non-local backend.
  baseURL: (() => {
    const envUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim();
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(envUrl);
    return envUrl && !isLocalhost ? envUrl : '';
  })(),
  // clientURL is only available on client-side
  get clientURL() {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  },
} as const;

// Helper to get full API URL
export const getApiUrl = (path: string): string => {
  const base = API_CONFIG.baseURL;
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const PAGE_ROUTES = {
  HOME: '/',
  DASHBOARD: '/command-center',
  LOGIN: '/login',
  TERMINAL: '/terminal',
  ORDERS: '/orders',
  POSITIONS: '/positions',
  HOLDINGS: '/holdings',
  ALERTS: '/alerts',
  SIMULATOR: '/simulator',
  ACCOUNTS: '/brokers',
  TRADING_PANEL: '/terminal', // Keeping key for compatibility, but value matches new route
  TRADING_GYM: '/gym',
  TRADING: '/trading',
  FUNDS: '/funds',
  ASSETS: '/portfolio',
  ANALYST_DESK: '/journal',
  SETTINGS: '/settings',
  CRYPTO: '/market-watch',
  CRYPTO_SCREENER: '/market-watch/screener',
  ADMIN: '/admin',
} as const;

export default {
  routes: API_ROUTES,
  config: API_CONFIG,
  pages: PAGE_ROUTES,
};

export { API_CONFIG, API_ROUTES, PAGE_ROUTES };
