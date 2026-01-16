"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, ChevronLeft, ArrowUpDown } from "lucide-react";
import { PAGE_ROUTES } from "@/lib/constants";

export default function CryptoScreenerPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
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
              0 USDT trading pairs available
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search pairs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            title="Reset Sort"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Ticker Table Placeholder */}
      <div className="rounded-lg border border-dashed p-8 bg-muted/20 text-center">
        <p className="text-muted-foreground">
          Ticker table component will be migrated here.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Features: Sortable columns, real-time price updates, search filtering
        </p>
      </div>
    </div>
  );
}
