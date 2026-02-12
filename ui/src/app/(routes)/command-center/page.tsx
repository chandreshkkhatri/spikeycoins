"use client";

import Link from "next/link";
import EnhancedCard from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts/auth-context";
import { PAGE_ROUTES } from "@/lib/constants";
import {
  ArrowRight,
  BookOpen,
  Coins,
  Dumbbell,
  LayoutDashboard,
  LineChart,
  Users,
  Wallet,
} from "lucide-react";

export default function DashboardPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingSpinner message="Initializing Command Center..." />;
  }

  const quickActions = [
    {
      title: "Terminal",
      description: "Professional trading interface with multi-chart layout",
      icon: LineChart,
      href: PAGE_ROUTES.TRADING_PANEL,
      gradient: "from-blue-600 to-indigo-600",
    },
    {
      title: "Journal",
      description: "Review trades and analyze your performance",
      icon: BookOpen,
      href: PAGE_ROUTES.ANALYST_DESK,
      gradient: "from-emerald-600 to-teal-600",
    },
    {
      title: "Market Watch",
      description: "Track crypto markets, top movers, and price trends",
      icon: Coins,
      href: PAGE_ROUTES.CRYPTO,
      gradient: "from-cyan-600 to-blue-600",
    },
    {
      title: "Portfolio",
      description: "Track assets, holdings, and fund distribution",
      icon: Wallet,
      href: PAGE_ROUTES.ASSETS,
      gradient: "from-violet-600 to-purple-600",
    },
    {
      title: "Gym",
      description: "Practice strategies with historical market replay",
      icon: Dumbbell,
      href: PAGE_ROUTES.TRADING_GYM,
      gradient: "from-amber-600 to-orange-600",
    },
    {
      title: "Brokers",
      description: "Manage API connections and account settings",
      icon: Users,
      href: PAGE_ROUTES.ACCOUNTS,
      gradient: "from-pink-600 to-rose-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Command Center
          </h1>
          <p className="text-muted-foreground">
            Welcome back, Trader. Here&apos;s your market overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isLoggedIn ? "success" : "warning"} className="px-3 py-1 text-sm">
            {isLoggedIn ? "● System Online" : "○ Offline Mode"}
          </Badge>
          <Button size="sm" variant="outline">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Customize
          </Button>
        </div>
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action, i) => (
          <Link key={i} href={action.href} className="group relative block">
            <div className="relative h-full overflow-hidden rounded-2xl border border-border/50 bg-card p-1 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
              <div className="relative h-full rounded-xl bg-gradient-to-br from-muted/50 to-muted/10 p-6 dark:from-muted/10 dark:to-background">
                <div className="mb-4 inline-flex rounded-xl bg-background p-3 shadow-sm ring-1 ring-border/50">
                  <div
                    className={`absolute inset-0 rounded-xl bg-gradient-to-br ${action.gradient} opacity-10`}
                  />
                  <action.icon className="h-6 w-6 text-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-foreground">
                  {action.title}
                </h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  {action.description}
                </p>
                <div className="absolute bottom-6 right-6 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">
                  <ArrowRight className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!isLoggedIn && (
        <EnhancedCard title="System Notice" className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-900/10">
          <div className="flex items-center gap-3 text-yellow-800 dark:text-yellow-200">
            <div className="text-2xl">⚠️</div>
            <div>
              <p className="font-semibold">Local Session Only</p>
              <p className="text-sm opacity-90">
                You are currently in offline mode. Connect an account to enable live trading and cloud sync.
                <Link href="/login" className="ml-2 underline hover:text-yellow-950 dark:hover:text-yellow-100">
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </EnhancedCard>
      )}
    </div>
  );
}
