"use client";

import { useTheme } from "@/contexts/theme-context";
import { Header } from "./Header";
import "./PageLayout.css";

interface PageLayoutProps {
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const { isDark } = useTheme();

  return (
    <div className={`page-layout ${isDark ? "dark-theme" : ""}`}>
      <Header />
      <main className="main-content">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
