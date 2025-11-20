import PageLayout from "@/components/layout/PageLayout";
import Watchlist from "@/components/watchlist/Watchlist";
import { useAccount } from "@/lib/account-context";

export default function TradingPanelPage() {
  const { accounts, selectedAccount } = useAccount();

  return (
    <PageLayout title="Trading Panel">
      <Watchlist accounts={accounts} selectedAccount={selectedAccount} />
    </PageLayout>
  );
}
