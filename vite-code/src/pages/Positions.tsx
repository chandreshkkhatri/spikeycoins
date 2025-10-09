import PageLayout from "@/components/layout/PageLayout";
import PositionsCard from "@/components/positions/PositionsCard";
import { useAccount } from "@/lib/account-context";

export default function PositionsPage() {
  const { accounts } = useAccount();

  return (
    <PageLayout title="Positions">
      <PositionsCard accounts={accounts} />
    </PageLayout>
  );
}
