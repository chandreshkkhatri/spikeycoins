"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@radix-ui/react-checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { GymThesis, MethodologyRuleConfig } from "./types";
import api, { getApiPath, isAuthenticationError } from "@/lib/api";
import { API_ROUTES } from "@/lib/constants";

export interface ThesisFormProps {
  sessionId: string;
  currentPrice: number;
  onSubmitTrade: (params: {
    side: "LONG" | "SHORT";
    stopLoss: number;
    takeProfit: number;
    type: "MARKET" | "LIMIT";
    limitPrice?: number;
    thesis: GymThesis;
  }) => Promise<void>;
  disabled?: boolean;
}

export function ThesisForm({
  sessionId,
  currentPrice,
  onSubmitTrade,
  disabled = false,
}: ThesisFormProps) {
  const [rules, setRules] = useState<MethodologyRuleConfig | null>(null);
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPriceInput, setLimitPriceInput] = useState<string>("");
  const [setupType, setSetupType] = useState<string>("pullback-to-structure");
  const [classification, setClassification] = useState<string>("day-trade");
  const [invalidationInput, setInvalidationInput] = useState<string>("");
  const [stopLossInput, setStopLossInput] = useState<string>("");
  const [takeProfitInput, setTakeProfitInput] = useState<string>("");
  const [riskPercentInput, setRiskPercentInput] = useState<string>("1.0");

  const [attestationReadiness, setAttestationReadiness] = useState<boolean>(true);
  const [attestationInvalidation, setAttestationInvalidation] = useState<boolean>(true);

  const [autoChecks, setAutoChecks] = useState<Array<{ id: string; name: string; passed: boolean; reason?: string }>>([]);
  const [previewValid, setPreviewValid] = useState<boolean>(false);
  const [calculatedQty, setCalculatedQty] = useState<number>(0);
  const [riskAmount, setRiskAmount] = useState<number>(0);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Load methodology rules
  useEffect(() => {
    async function loadRules() {
      try {
        const res = await api.get(getApiPath(API_ROUTES.gym.rules));
        if (res.data?.success) {
          setRules(res.data.rules);
        }
      } catch (err) {
        if (!isAuthenticationError(err)) console.error("[ThesisForm] Error loading rules:", err);
      }
    }
    loadRules();
  }, []);

  // Update default inputs when currentPrice changes
  useEffect(() => {
    if (currentPrice > 0 && !limitPriceInput) {
      const isLong = side === "LONG";
      const stopDistance = currentPrice * 0.015;
      const targetDistance = currentPrice * 0.03;

      const defaultStop = isLong ? currentPrice - stopDistance : currentPrice + stopDistance;
      const defaultTarget = isLong ? currentPrice + targetDistance : currentPrice - targetDistance;

      setLimitPriceInput(currentPrice.toFixed(2));
      setInvalidationInput(defaultStop.toFixed(2));
      setStopLossInput(defaultStop.toFixed(2));
      setTakeProfitInput(defaultTarget.toFixed(2));
    }
  }, [currentPrice, side, limitPriceInput]);

  // Run dry-run preview validation
  useEffect(() => {
    async function runPreview() {
      const triggerPrice = orderType === "LIMIT" ? parseFloat(limitPriceInput) : currentPrice;
      const invalidationPrice = parseFloat(invalidationInput);
      const plannedStop = parseFloat(stopLossInput);
      const targetPrice = parseFloat(takeProfitInput);
      const plannedRiskPercent = parseFloat(riskPercentInput);

      if (
        isNaN(triggerPrice) ||
        isNaN(invalidationPrice) ||
        isNaN(plannedStop) ||
        isNaN(targetPrice) ||
        triggerPrice <= 0
      ) {
        return;
      }

      try {
        const res = await api.post(getApiPath(API_ROUTES.gym.thesisPreview(sessionId)), {
          setupType,
          side,
          triggerPrice,
          invalidationPrice,
          plannedStop,
          targetPrice,
          classification,
          plannedRiskPercent,
        });

        if (res.data?.success && res.data.validation) {
          const val = res.data.validation;
          setAutoChecks(val.autoChecks || []);
          setPreviewValid(val.valid);
          setCalculatedQty(val.calculatedQuantity || 0);
          setRiskAmount(val.riskAmount || 0);
          setPreviewError(val.reason || null);
        }
      } catch {
        // Fallback preview
      }
    }

    const timer = setTimeout(runPreview, 250);
    return () => clearTimeout(timer);
  }, [
    sessionId,
    currentPrice,
    side,
    orderType,
    limitPriceInput,
    setupType,
    classification,
    invalidationInput,
    stopLossInput,
    takeProfitInput,
    riskPercentInput,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const triggerPrice = orderType === "LIMIT" ? parseFloat(limitPriceInput) : currentPrice;
    const invalidationPrice = parseFloat(invalidationInput);
    const stopLoss = parseFloat(stopLossInput);
    const takeProfit = parseFloat(takeProfitInput);
    const plannedRiskPercent = parseFloat(riskPercentInput);

    const thesis: GymThesis = {
      setupType,
      thesisTimeframe: "15m",
      triggerPrice,
      invalidationPrice,
      plannedStop: stopLoss,
      targetPrice: takeProfit,
      classification,
      plannedRiskPercent,
      autoChecks,
      attestations: {
        readiness: attestationReadiness,
        invalidationRespected: attestationInvalidation,
      },
    };

    await onSubmitTrade({
      side,
      stopLoss,
      takeProfit,
      type: orderType,
      ...(orderType === "LIMIT" && { limitPrice: triggerPrice }),
      thesis,
    });
  };

  const isFormValid =
    previewValid &&
    attestationReadiness &&
    attestationInvalidation &&
    !disabled;

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 space-y-4 text-xs">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Trade Thesis & Order Entry</h3>
        </div>
        <Badge variant={side === "LONG" ? "success" : "danger"} className="text-xs">
          {side} {orderType}
        </Badge>
      </div>

      {/* Side & Order Type Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex rounded-md border p-1 gap-1">
          <Button
            type="button"
            size="sm"
            variant={side === "LONG" ? "default" : "ghost"}
            className="w-1/2 h-7 text-xs"
            onClick={() => setSide("LONG")}
          >
            <TrendingUp className="h-3 w-3 mr-1 text-emerald-500" /> LONG
          </Button>
          <Button
            type="button"
            size="sm"
            variant={side === "SHORT" ? "default" : "ghost"}
            className="w-1/2 h-7 text-xs"
            onClick={() => setSide("SHORT")}
          >
            <TrendingDown className="h-3 w-3 mr-1 text-red-500" /> SHORT
          </Button>
        </div>

        <div className="flex rounded-md border p-1 gap-1">
          <Button
            type="button"
            size="sm"
            variant={orderType === "MARKET" ? "default" : "ghost"}
            className="w-1/2 h-7 text-xs"
            onClick={() => setOrderType("MARKET")}
          >
            MARKET
          </Button>
          <Button
            type="button"
            size="sm"
            variant={orderType === "LIMIT" ? "default" : "ghost"}
            className="w-1/2 h-7 text-xs"
            onClick={() => setOrderType("LIMIT")}
          >
            LIMIT
          </Button>
        </div>
      </div>

      {/* Setup & Classification Selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Declared Setup Type</label>
          <Select value={setupType} onValueChange={setSetupType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select setup" />
            </SelectTrigger>
            <SelectContent>
              {rules?.setupTypes?.map((st) => (
                <SelectItem key={st.id} value={st.id} className="text-xs">
                  {st.name}
                </SelectItem>
              )) || (
                <>
                  <SelectItem value="pullback-to-structure">Pullback to Structure</SelectItem>
                  <SelectItem value="breakout-retest">Breakout Retest</SelectItem>
                  <SelectItem value="pivot-reversal">Pivot Reversal</SelectItem>
                  <SelectItem value="range-fade">Range Fade</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Horizon Classification</label>
          <Select value={classification} onValueChange={setClassification}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select horizon" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scalp">Scalp (Short)</SelectItem>
              <SelectItem value="day-trade">Day Trade (Medium)</SelectItem>
              <SelectItem value="swing">Swing (Long)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Price Inputs */}
      <div className="grid grid-cols-2 gap-3">
        {orderType === "LIMIT" && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Limit Entry Price</label>
            <Input
              type="number"
              step="0.01"
              value={limitPriceInput}
              onChange={(e) => setLimitPriceInput(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Invalidation Price</label>
          <Input
            type="number"
            step="0.01"
            value={invalidationInput}
            onChange={(e) => setInvalidationInput(e.target.value)}
            className="h-8 text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Stop Loss</label>
          <Input
            type="number"
            step="0.01"
            value={stopLossInput}
            onChange={(e) => setStopLossInput(e.target.value)}
            className="h-8 text-xs font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Take Profit Target</label>
          <Input
            type="number"
            step="0.01"
            value={takeProfitInput}
            onChange={(e) => setTakeProfitInput(e.target.value)}
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>

      {/* Automated Checks Feedback */}
      <div className="bg-muted/40 p-3 rounded-md space-y-1.5 border">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Automated Rule Verification
          </span>
          <span className="font-mono text-primary">
            Qty: {calculatedQty} (${riskAmount.toFixed(2)} risk)
          </span>
        </div>

        <div className="space-y-1 pt-1">
          {autoChecks.map((chk) => (
            <div key={chk.id} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1">
                {chk.passed ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                {chk.name}
              </span>
              {!chk.passed && chk.reason && (
                <span className="text-red-500 font-mono text-[10px]">{chk.reason}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Attestation Checkboxes */}
      <div className="space-y-2 pt-1 border-t text-[11px]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={attestationReadiness}
            onChange={(e) => setAttestationReadiness(e.target.checked)}
            className="rounded border-muted-foreground"
          />
          <span>Trade-readiness check: Mindset & focus align with methodology rulebook</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={attestationInvalidation}
            onChange={(e) => setAttestationInvalidation(e.target.checked)}
            className="rounded border-muted-foreground"
          />
          <span>Willingness to execute invalidation stop loss without hesitation or widening</span>
        </label>
      </div>

      <Button
        type="submit"
        disabled={!isFormValid}
        className={`w-full font-bold text-xs h-9 ${
          side === "LONG" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
        }`}
      >
        Place {side} {orderType} Order with Thesis
      </Button>
    </form>
  );
}
