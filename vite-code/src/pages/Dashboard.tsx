import { Link } from "react-router-dom";
import EnhancedCard from "@/components/enhanced-card";
import PageLayout from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { PAGE_ROUTES } from "@/lib/constants";

export default function DashboardPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <PageLayout title="Open Mandi">
      <div className="mb-12 text-center">
        <h1 className="mb-2 bg-gradient-to-br from-blue-500 to-blue-700 bg-clip-text text-4xl font-bold text-transparent">
          Trading Dashboard
        </h1>
        <p className="text-lg text-muted-foreground">
          Welcome to Open Mandi - Your Unified Trading Platform
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 pt-8 md:grid-cols-2 lg:grid-cols-3">
        <EnhancedCard
          title="Trading Panel"
          description="Monitor your favorite instruments and trade from one screen"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to={PAGE_ROUTES.TRADING_PANEL}>Go to Trading Panel</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Trading Gym"
          description="Practice trading with historical data and improve your skills"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to={PAGE_ROUTES.TRADING_GYM}>Go to Trading Gym</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Funds"
          description="View and manage your account balances"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/funds">View Funds</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Holdings"
          description="Manage your investment portfolio"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/holdings">View Holdings</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Account Management"
          description="Connect and manage multiple trading accounts"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/accounts">Manage Accounts</Link>
            </Button>
          }
        />
      </div>

      <EnhancedCard title="Connection Status">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <strong>Mode:</strong>
            <Badge variant={isLoggedIn ? "success" : "warning"} tone="soft">
              {isLoggedIn ? "Live Trading" : "Offline Mode"}
            </Badge>
          </div>
          {!isLoggedIn && (
            <div className="rounded-md border border-yellow-200 bg-yellow-100 p-3 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200">
              ⚠️ You are not signed in. Your settings will only be saved locally on this device.{" "}
              <a href="/login" className="font-medium underline">Sign in</a> to sync across devices.
            </div>
          )}
        </div>
      </EnhancedCard>
    </PageLayout>
  );
}
