import PageLayout from '@/components/layout/PageLayout';
import OrdersCard from '@/components/orders/OrdersCard';

export default function OrdersPage() {
  return (
    <PageLayout title="Orders">
      <OrdersCard />
    </PageLayout>
  );
}
