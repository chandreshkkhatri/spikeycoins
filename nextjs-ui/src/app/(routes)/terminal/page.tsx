"use client";

import Watchlist from "@/components/watchlist/Watchlist";
import { useAccount } from "@/contexts/account-context";

export default function TradingPanelPage() {
  const { accounts, selectedAccount } = useAccount();

  return (
    <div className="h-full w-full overflow-hidden">
      <Watchlist accounts={accounts} selectedAccount={selectedAccount} />
    </div>
  );
}
