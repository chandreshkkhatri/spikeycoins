'use client';

import { useTheme } from '@/lib/theme-context';
import { ReactNode } from 'react';
// Legacy NavBar replaced by new Radix-based Header
import { Header } from './Header';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  showApiConfig?: boolean;
  onShowApiPanel?: () => void;
  className?: string;
}

export default function PageLayout({
  children,
  title,
  showApiConfig = false,
  onShowApiPanel,
  className = '',
}: PageLayoutProps) {
  const { isDark } = useTheme();
  return (
    <div className={`page-layout ${isDark ? 'dark-theme' : ''} ${className}`}>
      <Header />

      <main className="main-content">
        <div className="container">{children}</div>
      </main>

      <style jsx>{`
        .page-layout {
          min-height: 100vh;
        }
        .page-layout.dark-theme {
          color: var(--foreground);
        }
        .main-content {
          margin-top: 16px;
          padding-bottom: 32px;
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 1rem;
        }
        @media (max-width: 960px) {
          .main-content {
            margin-top: 56px;
          }
        }
        @media (max-width: 640px) {
          .container {
            padding: 0 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
