import { Routes, Route, Navigate } from "react-router-dom";
import { PAGE_ROUTES } from "@/lib/constants";
import DashboardPage from "@/pages/Dashboard";
import AccountsPage from "@/pages/Accounts";
import HoldingsPage from "@/pages/Holdings";
import OrdersPage from "@/pages/Orders";
import PositionsPage from "@/pages/Positions";
import TradingPanelPage from "@/pages/TradingPanel";
import TradingPage from "@/pages/Trading";
import FundsPage from "@/pages/Funds";
import TradingGymPage from "@/pages/TradingGym";
import LoginPage from "@/pages/Login";
import AuthCallbackPage from "@/pages/AuthCallback";

function App() {
  return (
    <Routes>
      <Route
        path={PAGE_ROUTES.HOME}
        element={<Navigate to={PAGE_ROUTES.DASHBOARD} replace />}
      />
      <Route path={PAGE_ROUTES.DASHBOARD} element={<DashboardPage />} />
      <Route path={PAGE_ROUTES.ACCOUNTS} element={<AccountsPage />} />
      <Route path={PAGE_ROUTES.FUNDS} element={<FundsPage />} />
      <Route path={PAGE_ROUTES.HOLDINGS} element={<HoldingsPage />} />
      <Route path={PAGE_ROUTES.ORDERS} element={<OrdersPage />} />
      <Route path={PAGE_ROUTES.POSITIONS} element={<PositionsPage />} />
      <Route
        path={PAGE_ROUTES.TRADING_PANEL}
        element={<TradingPanelPage />}
      />
      <Route path={PAGE_ROUTES.TRADING_GYM} element={<TradingGymPage />} />
      <Route path={PAGE_ROUTES.TRADING} element={<TradingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="*"
        element={<Navigate to={PAGE_ROUTES.DASHBOARD} replace />}
      />
    </Routes>
  );
}

export default App;
