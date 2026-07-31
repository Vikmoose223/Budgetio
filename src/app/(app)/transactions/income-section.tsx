"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatILS, formatDate } from "@/lib/format";
import {
  summarizeIncome,
  cashFlow,
  INCOME_SOURCE_LABELS,
  type IncomeSource,
} from "@/lib/income";
import { IncomeForm, type IncomeValues, type Member } from "./income-form";
import { toast } from "sonner";
import { Plus, TrendingUp, ChevronDown } from "lucide-react";

export type Income = {
  id: string;
  occurred_on: string;
  amount: number;
  source: IncomeSource;
  description: string | null;
  owner_profile_id: string | null;
  recurring: boolean;
};

/**
 * Income for the month on screen, shown directly against the same month's
 * spending — the headline is the net, because that's the number that says
 * whether the month worked.
 */
export function IncomeSection({
  householdId,
  userId,
  members,
  incomes,
  expenseTotal,
  month,
}: {
  householdId: string;
  userId: string;
  members: Member[];
  incomes: Income[];
  expenseTotal: number;
  month: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when the month changes: this component instance survives the
  // ?month= navigation, so state seeded from props would otherwise freeze.
  const [syncedMonth, setSyncedMonth] = useState(month);
  const [rows, setRows] = useState<Income[]>(incomes);
  if (syncedMonth !== month) {
    setSyncedMonth(month);
    setRows(incomes);
  }

  const summary = summarizeIncome(rows);
  const flow = cashFlow(summary.total, expenseTotal);

  async function handleSubmit(v: IncomeValues) {
    setSubmitting(true);
    const supabase = createClient();
    try {
      const payload = {
        household_id: householdId,
        occurred_on: v.occurredOn,
        amount: parseFloat(v.amount),
        source: v.source,
        description: v.description || null,
        owner_profile_id: v.ownerProfileId || null,
        recurring: v.recurring,
        created_by: userId,
      };

      if (editing) {
        const { data, error } = await supabase
          .from("incomes")
          .update(payload)
          .eq("id", editing.id)
          .select("id, occurred_on, amount, source, description, owner_profile_id, recurring")
          .single();
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === data.id ? (data as Income) : r)));
        toast.success("ההכנסה עודכנה");
      } else {
        const { data, error } = await supabase
          .from("incomes")
          .insert(payload)
          .select("id, occurred_on, amount, source, description, owner_profile_id, recurring")
          .single();
        if (error) throw error;
        setRows((prev) => [data as Income, ...prev]);
        toast.success("ההכנסה נוספה");
      }
      setOpen(false);
      setEditing(null);
      router.refresh();
    } catch {
      toast.error("שמירה נכשלה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSubmitting(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.from("incomes").delete().eq("id", editing.id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== editing.id));
      toast.success("ההכנסה נמחקה");
      setOpen(false);
      setEditing(null);
      router.refresh();
    } catch {
      toast.error("מחיקה נכשלה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="size-4 text-success" />
          הכנסות מול הוצאות
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          הכנסה
        </Button>
      </div>

      {/* The three numbers that matter for the month. */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">הכנסות</p>
          <p className="text-sm font-semibold tabular-nums text-success">
            {formatILS(flow.income)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">הוצאות</p>
          <p className="text-sm font-semibold tabular-nums">
            {formatILS(flow.expenses)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {flow.net >= 0 ? "נשאר" : "גירעון"}
          </p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              flow.net >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {formatILS(Math.abs(flow.net))}
          </p>
        </div>
      </div>

      {/* Proportion of income consumed by spending. */}
      {flow.spentShare !== null && (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-success/20">
            <div
              className={cn(
                "h-full rounded-full",
                flow.spentShare > 1 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, flow.spentShare * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            {flow.savingsRate !== null && flow.savingsRate >= 0
              ? `חסכתם ${Math.round(flow.savingsRate * 100)}% מההכנסה`
              : `ההוצאות גבוהות ב-${Math.round((flow.spentShare - 1) * 100)}% מההכנסה`}
          </p>
        </>
      )}

      {rows.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "הסתרה" : `פירוט ${rows.length} הכנסות`}
            <ChevronDown
              className={cn("size-3 transition-transform", expanded && "rotate-180")}
            />
          </button>

          {expanded && (
            <div className="mt-2 flex flex-col gap-1">
              {[...rows]
                .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-right transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {r.description || INCOME_SOURCE_LABELS[r.source]}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {INCOME_SOURCE_LABELS[r.source]} · {formatDate(r.occurred_on)}
                        {r.recurring ? " · קבועה" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-success">
                      {formatILS(Number(r.amount))}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת הכנסה" : "הוספת הכנסה"}</DialogTitle>
            <DialogDescription>
              משכורת, עבודה עצמאית, שכר דירה או כל הכנסה אחרת.
            </DialogDescription>
          </DialogHeader>
          <IncomeForm
            key={editing?.id ?? "new"}
            members={members}
            initial={
              editing
                ? {
                    amount: String(editing.amount),
                    source: editing.source,
                    occurredOn: editing.occurred_on,
                    description: editing.description ?? "",
                    ownerProfileId: editing.owner_profile_id ?? "",
                    recurring: editing.recurring,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            onDelete={editing ? handleDelete : undefined}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
