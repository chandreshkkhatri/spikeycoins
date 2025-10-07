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
  // New unified trading API routes
  trading: {
    getOrders: '/api/trading/orders',
    getPositions: '/api/trading/positions',
    getHoldings: '/api/trading/holdings',
  },
  // Account management routes
  accounts: {
    list: '/api/accounts',
    getAccounts: '/api/accounts',
    create: '/api/accounts',
    get: (id: string) => `/api/accounts/${id}`,
    update: (id: string) => `/api/accounts/${id}`,
    delete: (id: string) => `/api/accounts/${id}`,
  },
  // General authentication routes
  auth: {
    checkStatus: '/api/auth/status',
    logout: '/api/auth/logout',
  },
  // Upstox authentication routes
  upstox: {
    login: '/api/auth/upstox/login',
    callback: '/api/auth/upstox/callback',
  },
  // Kite authentication routes
  kite: {
    login: '/api/auth/kite/login',
    callback: '/api/auth/kite/callback',
    session: '/api/auth/kite/session',
  },
} as const;

const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  clientURL: process.env.NEXT_PUBLIC_CLIENT_URL || 'http://localhost:3000',
  wsURL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000',
} as const;

const PAGE_ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  LOGIN: '/login',
  TERMINAL: '/terminal',
  ORDERS: '/orders',
  POSITIONS: '/positions',
  HOLDINGS: '/holdings',
  ALERTS: '/alerts',
  SIMULATOR: '/simulator',
  ACCOUNTS: '/accounts',
} as const;

export default {
  routes: API_ROUTES,
  config: API_CONFIG,
  pages: PAGE_ROUTES,
};

export { API_CONFIG, API_ROUTES, PAGE_ROUTES };
