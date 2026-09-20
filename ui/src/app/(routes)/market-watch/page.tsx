"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PAGE_ROUTES } from "@/lib/constants";
import { BarChart2 } from "lucide-react";
import PanelErrorBoundary from "@/components/PanelErrorBoundary";
import MarketOverview from "@/components/crypto/MarketOverview";
import MarketSummary from "@/components/crypto/MarketSummary";
import GainersLosers from "@/components/crypto/GainersLosers";

export default function CryptoHomePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Market Watch</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Binance USDT spot and perpetual markets, with source and update status
          </p>
        </div>
        <div className="flex items-center gap-2" aria-label="Market Watch sections">
          <Button aria-current="page">Overview</Button>
          <Link href={PAGE_ROUTES.CRYPTO_SCREENER}>
            <Button variant="outline">
            <BarChart2 className="h-4 w-4 mr-2" />
              Screener
            </Button>
          </Link>
        </div>
      </div>

      <PanelErrorBoundary name="Market Overview">
        <MarketOverview />
      </PanelErrorBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="order-2 lg:order-1 lg:col-span-2">
          <PanelErrorBoundary name="Market Summary">
            <MarketSummary />
          </PanelErrorBoundary>
        </div>
        <div className="order-1 lg:order-2">
          <PanelErrorBoundary name="Gainers & Losers">
            <GainersLosers />
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  );
}
