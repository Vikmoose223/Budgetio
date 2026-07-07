"use client";

import { useState } from "react";
import Link from "next/link";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import { formatILS, formatDate } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Cat = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: "expense" | "saving";
};
type Row = { category: Cat; spent: number; goal: number };
type Txn = {
  id: string;
  category_id: string | null;
  occurred_on: string;
  amount: number;
  description: string | null;
  merchant: string | null;
};

export function CategoryBreakdown({
  perCategory,
  uncategorizedSpent,
  transactions,
  month,
}: {
  perCategory: Row[];
  uncategorizedSpent: number;
  transactions: Txn[];
  month: string;
}) {
  const knownIds = new Set(perCategory.map((r) => r.category.id));
  const txByCat = new Map<string, Txn[]>();
  const uncategorized: Txn[] = [];
  for (const t of transactions) {
    if (t.category_id && knownIds.has(t.category_id)) {
      const arr = txByCat.get(t.category_id);
      if (arr) arr.push(t);
      else txByCat.set(t.category_id, [t]);
    } else {
      uncategorized.push(t);
    }
  }

  const expense = perCategory.filter((r) => r.category.kind === "expense");
  const saving = perCategory.filter((r) => r.category.kind === "saving");

  return (
    <div className="flex flex-col gap-1">
      {expense.map((r) => (
        <BreakdownRow
          key={r.category.id}
          row={r}
          txns={txByCat.get(r.category.id) ?? []}
          month={month}
        />
      ))}

      {uncategorizedSpent > 0 && (
        <BreakdownRow
          row={{
            category: {
              id: "none",
              name: "לא מסווג",
              icon: null,
              color: "muted-foreground",
              kind: "expense",
            },
            spent: uncategorizedSpent,
            goal: 0,
          }}
          txns={uncategorized}
          month={month}
        />
      )}

      {saving.length > 0 && (
        <div className="mt-1 border-t border-border pt-2">
          {saving.map((r) => (
            <BreakdownRow
              key={r.category.id}
              row={r}
              txns={txByCat.get(r.category.id) ?? []}
              month={month}
              saving
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  row,
  txns,
  month,
  saving,
}: {
  row: Row;
  txns: Txn[];
  month: string;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { category, spent, goal } = row;
  const pct = goal > 0 ? Math.min(100, (spent / goal) * 100) : 0;
  const over = goal > 0 && spent > goal;
  const barColor = saving
    ? "var(--success)"
    : over
      ? "var(--destructive)"
      : `var(--${category.color ?? "chart-1"})`;
  const hasTxns = txns.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasTxns && setOpen((o) => !o)}
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-lg p-1 text-right",
          hasTxns && "cursor-pointer hover:bg-accent/50",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md"
            style={categoryTintStyle(category.color)}
          >
            {categoryIconElement(category.icon, "size-3.5")}
          </span>
          <span className="flex-1 text-sm font-medium">{category.name}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatILS(spent)}
            {goal > 0 && (
              <span className="text-muted-foreground/70"> / {formatILS(goal)}</span>
            )}
          </span>
          {hasTxns && (
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          )}
        </div>
        {goal > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(pct, spent > 0 ? 4 : 0)}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        )}
      </button>

      {open && (
        <div className="mb-1 mr-9 flex flex-col gap-1.5 border-r border-border pr-3 pt-1.5">
          {txns.slice(0, 12).map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs">
              <span className="shrink-0 text-muted-foreground">
                {formatDate(t.occurred_on)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {t.description || t.merchant || "הוצאה"}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatILS(Number(t.amount))}
              </span>
            </div>
          ))}
          <Link
            href={`/transactions?category=${category.id}&month=${month.slice(0, 7)}`}
            className="mt-0.5 text-xs font-medium text-primary hover:underline"
          >
            כל ההוצאות ({txns.length}) ←
          </Link>
        </div>
      )}
    </div>
  );
}
