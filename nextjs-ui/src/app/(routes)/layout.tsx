"use client";

import { Header } from "@/components/layout/Header";
import { useTheme } from "@/contexts/theme-context";

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isDark } = useTheme();

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "dark" : ""}`}>
      <Header />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] px-3 md:px-6 py-4">
          {children}
        </div>
      </main>
    </div>
  );
}
