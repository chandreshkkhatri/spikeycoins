export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PivotType = "BULLISH" | "BEARISH";

export interface Pivot {
  index: number;
  price: number;
  type: PivotType;
  symmetry: number; // 0..1 score
}

export interface SwingLeg {
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  type: PivotType;
  barCount: number;
  priceChange: number;
  pctChange: number;
}

export type RsiZone = "BULLISH" | "BEARISH" | "NEUTRAL";

export type AlignmentVerdict =
  | "HTF_IMPULSE_LTF_CONSOLIDATION"
  | "FULL_ALIGNMENT_NO_TRADE"
  | "COUNTER_TREND"
  | "NO_ALIGNMENT";

export interface AlignmentResult {
  tradable: boolean;
  verdict: AlignmentVerdict;
  htfTrend: PivotType | "NEUTRAL";
  mainTrend: PivotType | "NEUTRAL";
  ltfState: "IMPULSE" | "CONSOLIDATION" | "NEUTRAL";
  reason: string;
}
