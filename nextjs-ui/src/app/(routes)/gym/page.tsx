"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import {
  Play,
  RefreshCw,
  Trophy,
  Target,
} from "lucide-react";

export default function TradingGymPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            Trading Gym
          </h1>
          <p className="text-muted-foreground">
            Practice chart analysis with obfuscated historical data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="text-lg px-4 py-1">
            <Trophy className="w-4 h-4 mr-1" />
            +0.00
          </Badge>
          <Button disabled={!user}>
            <RefreshCw className="w-4 h-4 mr-2" />
            New Session
          </Button>
        </div>
      </div>

      {/* No session state */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Target className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Start a Practice Session</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          You&apos;ll see obfuscated chart data from a random instrument and time period.
          Make predictions, place virtual trades, and track your score!
        </p>
        {user ? (
          <Button size="lg">
            <Play className="w-5 h-5 mr-2" />
            Start Training
          </Button>
        ) : (
          <div className="text-muted-foreground">
            <p className="mb-4">Please log in to start a trading gym session.</p>
            <Button variant="outline" onClick={() => window.location.href = "/login"}>
              Sign In
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed p-8 bg-muted/20 text-center">
        <p className="text-muted-foreground">
          Full Trading Gym functionality with charts will be migrated here.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Features: Historical chart replay, virtual trade placement, P&L tracking
        </p>
      </div>
    </div>
  );
}
