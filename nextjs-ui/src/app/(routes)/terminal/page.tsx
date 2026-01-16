"use client";

import { useAccount } from "@/contexts/account-context";

export default function TradingPanelPage() {
  const { accounts, selectedAccount } = useAccount();

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Trading Terminal</h1>
        <p className="text-muted-foreground mb-4">
          Professional trading interface with multi-chart layout
        </p>
        <div className="rounded-lg border border-dashed p-8 bg-muted/20">
          <p className="text-muted-foreground">
            Watchlist component will be migrated here.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Selected Account: {selectedAccount?.accountName || "None"}
          </p>
          <p className="text-sm text-muted-foreground">
            Total Accounts: {accounts.length}
          </p>
        </div>
      </div>
    </div>
  );
}
