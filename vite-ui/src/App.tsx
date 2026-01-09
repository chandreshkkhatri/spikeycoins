import { Routes, Route, Navigate } from "react-router-dom";
import { PAGE_ROUTES } from "@/lib/constants";
import DashboardPage from "@/pages/Dashboard";
import AccountsPage from "@/pages/Accounts";
import AssetsPage from "@/pages/Assets";
import TradingPanelPage from "@/pages/TradingPanel";
import TradingPage from "@/pages/Trading";
import TradingGymPage from "@/pages/TradingGym";
import LoginPage from "@/pages/Login";
import AuthCallbackPage from "@/pages/AuthCallback";
import SettingsPage from "@/pages/Settings";

function App() {
  return (
    <Routes>
      <Route
        path={PAGE_ROUTES.HOME}
        element={<Navigate to={PAGE_ROUTES.DASHBOARD} replace />}
      />
      <Route path={PAGE_ROUTES.DASHBOARD} element={<DashboardPage />} />
      <Route path={PAGE_ROUTES.ACCOUNTS} element={<AccountsPage />} />
      <Route path={PAGE_ROUTES.ASSETS} element={<AssetsPage />} />
      {/* Redirect old routes to Assets page */}
      <Route path={PAGE_ROUTES.FUNDS} element={<Navigate to={PAGE_ROUTES.ASSETS} replace />} />
      <Route path={PAGE_ROUTES.HOLDINGS} element={<Navigate to={PAGE_ROUTES.ASSETS} replace />} />
      <Route
        path={PAGE_ROUTES.TRADING_PANEL}
        element={<TradingPanelPage />}
      />
      <Route path={PAGE_ROUTES.TRADING_GYM} element={<TradingGymPage />} />
      <Route path={PAGE_ROUTES.TRADING} element={<TradingPage />} />
      <Route path={PAGE_ROUTES.SETTINGS} element={<SettingsPage />} />
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
