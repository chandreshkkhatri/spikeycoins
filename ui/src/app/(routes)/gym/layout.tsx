"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";

export default function GymLayout({ children }: { children: ReactNode }) {
  const { isLoading, isLoggedIn } = useAuth();

  if (isLoading) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Checking your session…</p>;
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Sign in to Trading Gym</h1>
        <p className="text-sm text-muted-foreground">Sign in to start training or resume your saved session.</p>
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </div>
    );
  }

  return children;
}
