"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/format";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import type { Category } from "./expense-form";

export type Segment = {
  /** Category id, or "none" for uncategorized. */
  id: string;
  label: string;
  amount: number;
  share: number;
  category: Category | null;
};

/**
 * Spending split by category for the month on screen, alongside the month
 * stepper — so the tab slices both ways rather than only by month.
 *
 * Each row links to the same month filtered to that category, reusing the
 * `?category=` filter the page already supports.
 */
export function CategorySegments({
  segments,
  month,
  activeId,
  total,
}: {
  segments: Segment[];
  month: string;
  activeId: string | null;
  total: number;
}) {
  if (segments.length === 0) return null;

  const monthParam = month.slice(0, 7);

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">פילוח לפי קטגוריה</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          סה״כ {formatILS(total)}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        {segments.map((s) => {
          const active = activeId === s.id;
          return (
            <Link
              key={s.id}
              href={
                active
                  ? `/transactions?month=${monthParam}`
                  : `/transactions?month=${monthParam}&category=${s.id}`
              }
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors",
                active ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-md"
                style={categoryTintStyle(s.category?.color)}
              >
                {categoryIconElement(s.category?.icon)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm">{s.label}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatILS(s.amount)}
                  </span>
                </div>
                {/* Proportion bar: the visual half of "slice by category". */}
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, Math.round(s.share * 100))}%` }}
                  />
                </div>
              </div>

              <span className="w-9 shrink-0 text-left text-xs text-muted-foreground tabular-nums">
                {Math.round(s.share * 100)}%
              </span>
            </Link>
          );
        })}
      </div>

      {activeId && (
        <Link
          href={`/transactions?month=${monthParam}`}
          className="mt-2 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          ניקוי הסינון
        </Link>
      )}
    </div>
  );
}
