"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { JournalTrade } from "./types";

interface TradesTableProps {
  trades: JournalTrade[];
  loading: boolean;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  } | null;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onPageChange: (page: number) => void;
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "-";
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "-";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SortHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const isActive = currentSort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 ${isActive ? "text-foreground" : "opacity-40"}`}
      />
    </button>
  );
}

export default function TradesTable({
  trades,
  loading,
  pagination,
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
}: TradesTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="p-8 text-center text-sm text-muted-foreground">
          Loading trades...
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="p-8 text-center text-sm text-muted-foreground">
          No trades found. Sync your account to import trades from Binance.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Symbol"
                  field="symbol"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Side
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Entry
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Exit
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Qty
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="P&L"
                  field="netPnl"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Duration
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Date"
                  field="entryTime"
                  currentSort={sortBy}
                  currentOrder={sortOrder}
                  onSort={onSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const pnlPercent =
                trade.avgEntryPrice > 0 && trade.maxQty > 0
                  ? (trade.netPnl /
                      (trade.avgEntryPrice * trade.maxQty)) *
                    100
                  : 0;

              return (
                <tr
                  key={trade._id}
                  className="border-b border-border/30 hover:bg-accent/5 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        trade.direction === "LONG" ? "success" : "danger"
                      }
                      className="text-[10px] px-1.5 py-0"
                    >
                      {trade.direction}
                    </Badge>
                    {trade.status === "OPEN" && (
                      <Badge
                        variant="info"
                        className="text-[10px] px-1.5 py-0 ml-1"
                      >
                        OPEN
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatPrice(trade.avgEntryPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatPrice(trade.avgExitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {trade.maxQty}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div
                      className={`font-medium ${trade.netPnl > 0 ? "text-green-500" : trade.netPnl < 0 ? "text-red-500" : "text-muted-foreground"}`}
                    >
                      {trade.netPnl >= 0 ? "+" : ""}
                      {trade.netPnl.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {pnlPercent >= 0 ? "+" : ""}
                      {pnlPercent.toFixed(2)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatDuration(trade.duration)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatDate(trade.entryTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total > pagination.pageSize && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-muted/20">
          <span className="text-xs text-muted-foreground">
            {(pagination.page - 1) * pagination.pageSize + 1}-
            {Math.min(
              pagination.page * pagination.pageSize,
              pagination.total,
            )}{" "}
            of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasMore}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
