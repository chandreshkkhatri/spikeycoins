import PageLayout from "@/components/layout/PageLayout";
import HoldingsCard from "@/components/holdings/HoldingsCard";
import { useAccount } from "@/lib/account-context";

export default function HoldingsPage() {
  const { accounts } = useAccount();

  return (
    <PageLayout title="Holdings">
      <HoldingsCard accounts={accounts} />
    </PageLayout>
  );
}
