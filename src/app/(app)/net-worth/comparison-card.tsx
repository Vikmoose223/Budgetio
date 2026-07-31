"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatILS, formatDate } from "@/lib/format";
import type { Delta, AccountDelta } from "@/lib/networth/compare";
import { History, TrendingUp, TrendingDown } from "lucide-react";

export type ComparisonPeriod = 1 | 3 | 12;

const PERIOD_LABELS: Record<ComparisonPeriod, string> = {
  1: "חודש",
  3: "3 חודשים",
  12: "שנה",
};

export type PeriodComparison = {
  months: ComparisonPeriod;
  net: Delta;
  accounts: AccountDelta[];
  /** Days until a baseline exists, when there isn't one yet. */
  daysUntil: number | null;
};

/**
 * Net worth now against a past snapshot.
 *
 * When no baseline exists it says so, and says when one will — an empty chart
 * with no explanation reads as broken, whereas "עוד 12 ימים" reads as working.
 */
export function ComparisonCard({
  comparisons,
  accountNames,
}: {
  comparisons: PeriodComparison[];
  accountNames: Record<string, string>;
}) {
  const [months, setMonths] = useState<ComparisonPeriod>(1);
  const active = comparisons.find((c) => c.months === months) ?? comparisons[0];
  if (!active) return null;

  const movers = active.accounts.filter((a) => a.change !== null && a.change !== 0);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          התקדמות
        </CardTitle>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {comparisons.map((c) => (
            <button
              key={c.months}
              type="button"
              onClick={() => setMonths(c.months)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                months === c.months
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PERIOD_LABELS[c.months]}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {active.net.change === null ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              אין עדיין נקודת השוואה מלפני {PERIOD_LABELS[active.months]}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {active.daysUntil !== null
                ? `האפליקציה מתעדת את השווי מדי יום — ההשוואה תהיה זמינה בעוד ${active.daysUntil} ימים.`
                : "האפליקציה מתעדת את השווי מדי יום מהרגע שהוספתם נכסים."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  {active.net.baselineDate
                    ? `ב-${formatDate(active.net.baselineDate)}`
                    : "אז"}
                </p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground">
                  {formatILS(active.net.previous ?? 0)}
                </p>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">היום</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatILS(active.net.current)}
                </p>
              </div>
            </div>

            <div
              className={cn(
                "mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium",
                active.net.change >= 0
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {active.net.change >= 0 ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )}
              {formatILS(Math.abs(active.net.change))}
              {active.net.changePct !== null &&
                ` (${(active.net.changePct * 100).toFixed(1)}%)`}
            </div>

            {movers.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  מה זז הכי הרבה
                </p>
                {movers.slice(0, 5).map((a) => (
                  <div key={a.accountId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {accountNames[a.accountId] ?? "חשבון"}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        (a.change ?? 0) >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {(a.change ?? 0) >= 0 ? "+" : "−"}
                      {formatILS(Math.abs(a.change ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
