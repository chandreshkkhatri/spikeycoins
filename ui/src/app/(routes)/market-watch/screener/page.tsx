"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart2 } from "lucide-react";
import { PAGE_ROUTES } from "@/lib/constants";
import PanelErrorBoundary from "@/components/PanelErrorBoundary";
import Ticker from "@/components/crypto/Ticker";

export default function CryptoScreenerPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Market Watch</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scan Binance USDT spot and perpetual markets
          </p>
        </div>
        <div className="flex items-center gap-2" aria-label="Market Watch sections">
          <Link href={PAGE_ROUTES.CRYPTO}>
            <Button variant="outline">Overview</Button>
          </Link>
          <Button aria-current="page">
            <BarChart2 className="mr-2 h-4 w-4" />
            Screener
          </Button>
        </div>
      </div>

      <PanelErrorBoundary name="Screener">
        <Ticker />
      </PanelErrorBoundary>
    </div>
  );
}
