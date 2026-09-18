"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  CandlestickSeries,
  CandlestickData,
  UTCTimestamp,
  createSeriesMarkers,
  SeriesMarker,
} from "lightweight-charts";
import { GymCandle } from "./types";

export interface GymChartPriceLine {
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number;
  title?: string;
  axisLabelVisible?: boolean;
}

export interface GymChartMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text?: string;
}

export interface GymChartProps {
  candles: GymCandle[];
  priceLines?: GymChartPriceLine[];
  markers?: GymChartMarker[];
  height?: number;
  onCandleClick?: (candleIndex: number) => void;
  syncGroupRef?: React.MutableRefObject<Set<IChartApi>>;
}

export function GymChart({
  candles,
  priceLines = [],
  markers = [],
  height = 400,
  onCandleClick,
  syncGroupRef,
}: GymChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<any>(null);
  const onCandleClickRef = useRef(onCandleClick);

  useEffect(() => {
    onCandleClickRef.current = onCandleClick;
  }, [onCandleClick]);

  // 1. Chart & Series Initialization (Runs ONCE on mount)
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
        horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      },
      width: containerRef.current.clientWidth,
      height: height,
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: false,
      },
      crosshair: {
        horzLine: { visible: true, labelVisible: true },
      },
    });

    chartRef.current = chart;

    if (syncGroupRef) {
      syncGroupRef.current.add(chart);
    }

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    seriesRef.current = series;

    // Create markers plugin instance (lightweight-charts v5)
    try {
      markersPluginRef.current = createSeriesMarkers(series, []);
    } catch {
      markersPluginRef.current = null;
    }

    // Subscribe to candle click
    const handleChartClick = (param: any) => {
      if (!param || param.time == null || !onCandleClickRef.current) return;
      const index = Number(param.time);
      if (!isNaN(index)) {
        onCandleClickRef.current(index);
      }
    };
    chart.subscribeClick(handleChartClick);

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0] && containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: entries[0].contentRect.width,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeClick(handleChartClick);
      if (syncGroupRef) {
        syncGroupRef.current.delete(chart);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersPluginRef.current = null;
      priceLinesRef.current = [];
    };
  }, [height, syncGroupRef]);

  // 2. Update Candle Data (Without re-creating chart)
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const chartData: CandlestickData[] = candles.map((c, i) => ({
      time: i as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(chartData);
  }, [candles]);

  // 3. Update Price Lines
  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove existing price lines
    priceLinesRef.current.forEach((line) => {
      try {
        seriesRef.current?.removePriceLine(line);
      } catch {
        // Line might already be destroyed
      }
    });
    priceLinesRef.current = [];

    // Add new price lines
    priceLines.forEach((pl) => {
      if (seriesRef.current && pl.price != null && !isNaN(pl.price)) {
        const line = seriesRef.current.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: (pl.lineWidth as any) || 1,
          lineStyle: pl.lineStyle ?? 2,
          title: pl.title || "",
          axisLabelVisible: pl.axisLabelVisible ?? true,
        });
        priceLinesRef.current.push(line);
      }
    });
  }, [priceLines]);

  // 4. Update Series Markers
  useEffect(() => {
    if (!markersPluginRef.current) return;

    const formattedMarkers: SeriesMarker<UTCTimestamp>[] = markers.map((m) => ({
      time: m.time as UTCTimestamp,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text || "",
    }));

    try {
      markersPluginRef.current.setMarkers(formattedMarkers);
    } catch {
      // Fallback
    }
  }, [markers]);

  return <div ref={containerRef} className="w-full relative rounded-md border overflow-hidden" />;
}
