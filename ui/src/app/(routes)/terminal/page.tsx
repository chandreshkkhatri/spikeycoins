"use client";

import Watchlist from "@/components/watchlist/Watchlist";
import { useAccount } from "@/contexts/account-context";

export default function TradingPanelPage() {
  const { accounts, selectedAccount } = useAccount();

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: 'calc(100vh - 3.5rem - 2rem)' }}
    >
      <Watchlist accounts={accounts} selectedAccount={selectedAccount} />
    </div>
  );
}
