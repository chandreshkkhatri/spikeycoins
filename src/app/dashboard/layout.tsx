import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - Flip Safe',
  description: 'Trading dashboard with market data and portfolio management',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
