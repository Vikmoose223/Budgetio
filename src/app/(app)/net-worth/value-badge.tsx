"use client";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { ValueBasis } from "@/lib/networth/value";

/**
 * Provenance chip. The page rule is that no value appears without saying where
 * it came from — a live quote, a number you typed, or an estimate drifted from
 * published fund returns.
 */
export function ValueBadge({
  basis,
  asOf,
  lastYieldPeriod,
  className,
}: {
  basis: ValueBasis;
  asOf: string | null;
  lastYieldPeriod?: number | null;
  className?: string;
}) {
  const { label, tone, title } = describe(basis, asOf, lastYieldPeriod);
  if (!label) return null;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        tone === "exact" && "bg-success/10 text-success",
        tone === "estimate" && "bg-primary/10 text-primary",
        tone === "stale" && "bg-muted text-muted-foreground",
        tone === "missing" && "bg-destructive/10 text-destructive",
        className,
      )}
    >
      {label}
    </span>
  );
}

function periodLabel(period: number): string {
  const y = Math.floor(period / 100);
  const m = String(period % 100).padStart(2, "0");
  return `${m}/${y}`;
}

function describe(
  basis: ValueBasis,
  asOf: string | null,
  lastYieldPeriod?: number | null,
): { label: string | null; tone: "exact" | "estimate" | "stale" | "missing"; title: string } {
  switch (basis) {
    case "holdings":
      return {
        label: "מדויק",
        tone: "exact",
        title: asOf ? `מחיר שוק מ-${formatDate(asOf)}` : "מחיר שוק",
      };
    case "computed":
      return {
        label: "מחושב",
        tone: "exact",
        title: "לוח סילוקין מחושב מתנאי ההלוואה",
      };
    case "drift":
      return {
        label: "מוערך",
        tone: "estimate",
        title: [
          asOf ? `עוגן ידני מ-${formatDate(asOf)}` : null,
          lastYieldPeriod ? `תשואות עד ${periodLabel(lastYieldPeriod)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "anchor":
      return {
        label: "ידני",
        tone: "stale",
        title: asOf ? `עודכן ${formatDate(asOf)}` : "הוזן ידנית",
      };
    case "none":
      return { label: "חסר שווי", tone: "missing", title: "לא הוזנה יתרה" };
  }
}
