import { ICandle } from "../session/candles";
import { evaluateTrendState, TrendState } from "./structure";

export type AlignmentCode =
  | "HTF_IMPULSE_LTF_CONSOLIDATION"
  | "FULL_ALIGNMENT_NO_TRADE"
  | "CHOP_NO_TRADE"
  | "COUNTER_TREND_NO_TRADE";

export interface IAlignmentResult {
  tradable: boolean;
  code: AlignmentCode;
  verdict: string;
  htfState: TrendState;
  mainState: TrendState;
  ltfState: TrendState;
}

/**
 * Evaluate 3x3x2 multi-timeframe alignment matrix.
 * Enforces the core methodology rule: FULL_ALIGNMENT_NO_TRADE (all 3 impulsing together = NO trade).
 */
export function evaluateAlignment(
  higherCandles: ICandle[],
  mainCandles: ICandle[],
  lowerCandles: ICandle[]
): IAlignmentResult {
  const htfState = evaluateTrendState(higherCandles);
  const mainState = evaluateTrendState(mainCandles);
  const ltfState = evaluateTrendState(lowerCandles);

  // 1. HTF Consolidating => CHOP_NO_TRADE
  if (htfState === "CONSOLIDATING") {
    return {
      tradable: false,
      code: "CHOP_NO_TRADE",
      verdict: "No Trade: Higher timeframe is consolidating without trend direction",
      htfState,
      mainState,
      ltfState,
    };
  }

  // 2. All 3 timeframes impulsing together in same direction => FULL_ALIGNMENT_NO_TRADE
  if (htfState === mainState && mainState === ltfState) {
    return {
      tradable: false,
      code: "FULL_ALIGNMENT_NO_TRADE",
      verdict: "No Trade: All timeframes are impulsing together (move is extended / exhaustion risk)",
      htfState,
      mainState,
      ltfState,
    };
  }

  // 3. Counter-trend on LTF relative to HTF => COUNTER_TREND_NO_TRADE
  if (
    (htfState === "BULLISH" && ltfState === "BEARISH") ||
    (htfState === "BEARISH" && ltfState === "BULLISH")
  ) {
    return {
      tradable: false,
      code: "COUNTER_TREND_NO_TRADE",
      verdict: "No Trade: Lower timeframe is impulsing against higher timeframe trend",
      htfState,
      mainState,
      ltfState,
    };
  }

  // 4. HTF Impulsing + LTF Consolidating / Pullback => HTF_IMPULSE_LTF_CONSOLIDATION (TRADABLE)
  if (
    (htfState === "BULLISH" && ltfState === "CONSOLIDATING") ||
    (htfState === "BEARISH" && ltfState === "CONSOLIDATING") ||
    (htfState === mainState && ltfState === "CONSOLIDATING")
  ) {
    return {
      tradable: true,
      code: "HTF_IMPULSE_LTF_CONSOLIDATION",
      verdict: "Tradable: HTF in trend direction, LTF consolidating/pullback for entry",
      htfState,
      mainState,
      ltfState,
    };
  }

  return {
    tradable: false,
    code: "CHOP_NO_TRADE",
    verdict: "No Trade: Timeframe alignment does not satisfy edge conditions",
    htfState,
    mainState,
    ltfState,
  };
}
