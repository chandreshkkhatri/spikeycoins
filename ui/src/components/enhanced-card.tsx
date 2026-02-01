"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EnhancedCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  hoverable?: boolean;
  action?: ReactNode;
  imageUrl?: string;
  imageAlt?: string;
  clickable?: boolean;
  href?: string;
  customBackground?: string;
  customTextColor?: string;
};

export default function EnhancedCard({
  title,
  description,
  children,
  className = "",
  hoverable = true,
  action,
  imageUrl,
  imageAlt = "Card media",
  clickable = false,
  href,
}: EnhancedCardProps) {
  // Only make the whole card clickable if there's no conflicting action area.
  const isOverlayLink = clickable && href && !action;

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card text-card-foreground shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-4",
        hoverable && "hover:-translate-y-1 hover:shadow-xl hover:border-primary/20",
        className
      )}
    >
      {isOverlayLink && (
        <Link
          href={href!}
          aria-label={typeof title === "string" ? title : "Open card"}
          className="absolute inset-0 z-10"
        />
      )}

      {imageUrl && (
        <div className="relative h-48 w-full overflow-hidden">
          <img
            src={imageUrl}
            alt={imageAlt}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-transparent pointer-events-none" />
        </div>
      )}

      {(title || description) && (
        <div className="p-6 pb-2">
          {title && <div className="mb-2 text-xl font-semibold leading-tight tracking-tight">{title}</div>}
          {description && (
            <div className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      )}

      {children && <div className="flex-1 p-6 pt-2">{children}</div>}

      {action && (
        <div className="mt-auto border-t border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            {action}
          </div>
        </div>
      )}
    </div>
  );
}
