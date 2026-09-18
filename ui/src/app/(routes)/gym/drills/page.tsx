"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GymChart } from "@/components/gym/gym-chart";
import { GymCandle } from "@/components/gym/types";
import api from "@/lib/api";
import { API_ROUTES } from "@/lib/constants";
import { Target, CheckCircle2, RefreshCw, Trophy, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function GymDrillsPage() {
  const [drillType, setDrillType] = useState<"PIVOT" | "MOMENTUM" | "ALIGNMENT" | "IMPULSE_CORRECTIVE">("PIVOT");
  const [drill, setDrill] = useState<{
    id: string;
    drillType: string;
    candles: GymCandle[];
    status: string;
    score?: number | null;
    metrics?: any;
    answerKey?: any;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [markedIndices, setMarkedIndices] = useState<number[]>([]);
  const [selectedRsiZone, setSelectedRsiZone] = useState<string>("BULLISH");
  const [selectedAlignment, setSelectedAlignment] = useState<string>("HTF_IMPULSE_LTF_CONSOLIDATION");

  const startDrill = async (type: typeof drillType) => {
    try {
      setLoading(true);
      setMarkedIndices([]);
      const res = await api.post(API_ROUTES.gym.drills.start, { drillType: type });
      if (res.data?.success) {
        setDrill(res.data.drill);
        setDrillType(type);
      }
    } catch (err) {
      console.error("[DrillsPage] Error starting drill:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCandleClick = (candleIndex: number) => {
    if (drillType !== "PIVOT" || drill?.status !== "ACTIVE") return;
    setMarkedIndices((prev) =>
      prev.includes(candleIndex) ? prev.filter((i) => i !== candleIndex) : [...prev, candleIndex]
    );
  };

  const submitDrill = async () => {
    if (!drill) return;
    try {
      setLoading(true);
      let submission: any = {};
      if (drillType === "PIVOT") {
        submission = { marks: markedIndices };
      } else if (drillType === "MOMENTUM") {
        submission = { rsiZone: selectedRsiZone };
      } else if (drillType === "ALIGNMENT") {
        submission = { code: selectedAlignment };
      }

      const res = await api.post(API_ROUTES.gym.drills.submit(drill.id), { submission });
      if (res.data?.success) {
        setDrill(res.data.drill);
      }
    } catch (err) {
      console.error("[DrillsPage] Error submitting drill:", err);
    } finally {
      setLoading(false);
    }
  };

  const chartMarkers = markedIndices.map((idx) => ({
    time: idx,
    position: "belowBar" as const,
    color: "#eab308",
    shape: "circle" as const,
    text: "P",
  }));

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/gym">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Technical Analysis Drills
            </h1>
            <p className="text-xs text-muted-foreground">
              Isolated perceptual practice for structural pivots, momentum RSI zones, and alignment rules.
            </p>
          </div>
        </div>
      </div>

      {/* Drill Selection Tabs */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant={drillType === "PIVOT" ? "default" : "outline"}
          className="text-xs h-9"
          onClick={() => startDrill("PIVOT")}
        >
          Pivot Marking
        </Button>
        <Button
          variant={drillType === "MOMENTUM" ? "default" : "outline"}
          className="text-xs h-9"
          onClick={() => startDrill("MOMENTUM")}
        >
          Momentum Filter
        </Button>
        <Button
          variant={drillType === "ALIGNMENT" ? "default" : "outline"}
          className="text-xs h-9"
          onClick={() => startDrill("ALIGNMENT")}
        >
          MTF Alignment
        </Button>
        <Button
          variant={drillType === "IMPULSE_CORRECTIVE" ? "default" : "outline"}
          className="text-xs h-9"
          onClick={() => startDrill("IMPULSE_CORRECTIVE")}
        >
          Impulse vs Corrective
        </Button>
      </div>

      {!drill ? (
        <div className="rounded-lg border bg-card p-12 text-center space-y-4">
          <Target className="h-12 w-12 mx-auto text-primary opacity-50" />
          <h3 className="text-lg font-semibold">Select a Drill to Start</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Drills build fast chart pattern recognition without risk. Pick a drill mode above to generate a synthetic challenge.
          </p>
          <Button onClick={() => startDrill("PIVOT")}>Start Pivot Marking Drill</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{drill.drillType}</Badge>
                <span className="text-xs text-muted-foreground">
                  {drillType === "PIVOT"
                    ? "Click candles on chart to mark degree-1 pivots"
                    : "Review chart patterns and select the correct structural read"}
                </span>
              </div>
              {drill.status === "ACTIVE" && (
                <Button size="sm" onClick={submitDrill} disabled={loading}>
                  Submit Answer
                </Button>
              )}
            </div>

            <GymChart
              candles={drill.candles || []}
              markers={chartMarkers}
              height={420}
              onCandleClick={handleCandleClick}
            />

            {/* Drill controls depending on type */}
            {drill.status === "ACTIVE" && drillType === "MOMENTUM" && (
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant={selectedRsiZone === "BULLISH" ? "default" : "outline"}
                  onClick={() => setSelectedRsiZone("BULLISH")}
                >
                  Bullish Zone (&gt;60)
                </Button>
                <Button
                  size="sm"
                  variant={selectedRsiZone === "BEARISH" ? "default" : "outline"}
                  onClick={() => setSelectedRsiZone("BEARISH")}
                >
                  Bearish Zone (&lt;40)
                </Button>
                <Button
                  size="sm"
                  variant={selectedRsiZone === "NEUTRAL" ? "default" : "outline"}
                  onClick={() => setSelectedRsiZone("NEUTRAL")}
                >
                  Neutral Zone (40-60)
                </Button>
              </div>
            )}

            {drill.status === "ACTIVE" && drillType === "ALIGNMENT" && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  size="sm"
                  variant={selectedAlignment === "HTF_IMPULSE_LTF_CONSOLIDATION" ? "default" : "outline"}
                  onClick={() => setSelectedAlignment("HTF_IMPULSE_LTF_CONSOLIDATION")}
                >
                  Tradable: HTF Impulse + LTF Consolidation
                </Button>
                <Button
                  size="sm"
                  variant={selectedAlignment === "FULL_ALIGNMENT_NO_TRADE" ? "default" : "outline"}
                  onClick={() => setSelectedAlignment("FULL_ALIGNMENT_NO_TRADE")}
                >
                  No Trade: All 3 Timeframes Impulsing Together
                </Button>
              </div>
            )}
          </div>

          {/* Drill Result Card */}
          {drill.status === "SUBMITTED" && (
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                  <h3 className="text-lg font-bold">Drill Scorecard</h3>
                </div>
                {drill.score != null ? (
                  <Badge variant={drill.score >= 80 ? "success" : "warning"} className="text-lg px-3 py-1">
                    {drill.score}% F1 SCORE
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="text-sm">
                    Self-Check Review
                  </Badge>
                )}
              </div>

              {drill.metrics && (
                <div className="grid grid-cols-3 gap-3 text-xs bg-muted/50 p-3 rounded-md font-mono">
                  {drill.metrics.precision != null && (
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Precision</span>
                      <span className="font-bold text-sm">{drill.metrics.precision}%</span>
                    </div>
                  )}
                  {drill.metrics.recall != null && (
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Recall</span>
                      <span className="font-bold text-sm">{drill.metrics.recall}%</span>
                    </div>
                  )}
                  {drill.metrics.tp != null && (
                    <div>
                      <span className="text-muted-foreground block text-[10px]">TP / FP / FN</span>
                      <span className="font-bold text-sm">
                        {drill.metrics.tp} / {drill.metrics.fp} / {drill.metrics.fn}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Button onClick={() => startDrill(drillType)}>Try Another Drill</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
