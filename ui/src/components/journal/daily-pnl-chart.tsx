"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  HistogramSeries,
  UTCTimestamp,
} from "lightweight-charts";
import type { ChartDataPoint } from "./types";

interface DailyPnlChartProps {
  data: ChartDataPoint[];
  loading: boolean;
}

export default function DailyPnlChart({ data, loading }: DailyPnlChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || loading) return;

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
      height: 280,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
    });

    chartRef.current = chart;

    const histogramSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
    });

    if (data.length > 0) {
      histogramSeries.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
          color: d.color || (d.value >= 0 ? "#22c55e" : "#ef4444"),
        })),
      );
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, loading]);

  if (loading) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        Loading chart...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return <div ref={containerRef} />;
}
