import { Routes, Route, Navigate } from 'react-router-dom';
import { PAGE_ROUTES } from '@/lib/constants';
import DashboardPage from '@/pages/Dashboard';
import AccountsPage from '@/pages/Accounts';
import HoldingsPage from '@/pages/Holdings';
import OrdersPage from '@/pages/Orders';
import PositionsPage from '@/pages/Positions';
import MarketWatchPage from '@/pages/MarketWatch';
import TradingPage from '@/pages/Trading';

function App() {
  return (
    <Routes>
      <Route path={PAGE_ROUTES.HOME} element={<Navigate to={PAGE_ROUTES.DASHBOARD} replace />} />
      <Route path={PAGE_ROUTES.DASHBOARD} element={<DashboardPage />} />
      <Route path={PAGE_ROUTES.ACCOUNTS} element={<AccountsPage />} />
      <Route path={PAGE_ROUTES.HOLDINGS} element={<HoldingsPage />} />
      <Route path={PAGE_ROUTES.ORDERS} element={<OrdersPage />} />
      <Route path={PAGE_ROUTES.POSITIONS} element={<PositionsPage />} />
      <Route path={PAGE_ROUTES.MARKET_WATCH} element={<MarketWatchPage />} />
      <Route path={PAGE_ROUTES.TRADING} element={<TradingPage />} />
      <Route path="*" element={<Navigate to={PAGE_ROUTES.DASHBOARD} replace />} />
    </Routes>
  );
}

export default App;
