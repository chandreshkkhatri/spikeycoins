import PageLayout from "@/components/layout/PageLayout";
import Watchlist from "@/components/watchlist/Watchlist";
import { useAccount } from "@/lib/account-context";

export default function MarketWatchPage() {
  const { accounts, selectedAccount } = useAccount();

  return (
    <PageLayout title="Market Watch">
      <Watchlist accounts={accounts} selectedAccount={selectedAccount} />
    </PageLayout>
  );
}
