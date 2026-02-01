"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { PAGE_ROUTES } from "@/lib/constants";
import Ticker from "@/components/crypto/Ticker";

export default function CryptoScreenerPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={PAGE_ROUTES.CRYPTO}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Market Watch</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time cryptocurrency prices and market data
          </p>
        </div>
      </div>

      <Ticker />
    </div>
  );
}
