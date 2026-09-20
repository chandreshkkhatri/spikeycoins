"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Watchlist from "@/components/watchlist/Watchlist";
import { useAccount } from "@/contexts/account-context";

const safeMarketWatchReturn = (value: string | null): string | null =>
  value?.startsWith("/market-watch/screener") && !value.startsWith("//")
    ? value
    : null;

function TradingPanelContent() {
  const { accounts, selectedAccount } = useAccount();
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || undefined;
  const returnTo = safeMarketWatchReturn(searchParams.get("returnTo"));

  return (
    <div className="flex h-[calc(100vh-3.5rem-2rem)] w-full flex-col gap-2 overflow-hidden">
      {returnTo && (
        <Link
          href={returnTo}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Market Watch scan
        </Link>
      )}
      <div className="min-h-0 flex-1">
        <Watchlist
          accounts={accounts}
          selectedAccount={selectedAccount}
          initialSymbol={initialSymbol}
        />
      </div>
    </div>
  );
}

export default function TradingPanelPage() {
  return (
    <Suspense>
      <TradingPanelContent />
    </Suspense>
  );
}
