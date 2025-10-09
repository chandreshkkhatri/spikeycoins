import PageLayout from "@/components/layout/PageLayout";
import OrdersCard from "@/components/orders/OrdersCard";
import { useAccount } from "@/lib/account-context";

export default function OrdersPage() {
  const { accounts } = useAccount();

  return (
    <PageLayout title="Orders">
      <OrdersCard accounts={accounts} />
    </PageLayout>
  );
}
