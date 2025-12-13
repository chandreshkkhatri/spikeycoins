import "./PageLayout.css";
import { useTheme } from "@/lib/theme-context";
import { ReactNode } from "react";
// Legacy NavBar replaced by new Radix-based Header
import { Header } from "./Header";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  showApiConfig?: boolean;
  onShowApiPanel?: () => void;
  className?: string;
}

export default function PageLayout({
  children,
  className = "",
}: PageLayoutProps) {
  const { isDark } = useTheme();
  return (
    <div className={`page-layout ${isDark ? "dark-theme" : ""} ${className}`}>
      <Header />

      <main className="main-content">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
