"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpenseForm, type Category, type ExpenseValues } from "./expense-form";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import { formatILS, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Receipt } from "lucide-react";

type Txn = {
  id: string;
  category_id: string | null;
  occurred_on: string;
  amount: number;
  description: string | null;
  merchant: string | null;
  source: string;
};

const TXN_COLS =
  "id, category_id, occurred_on, amount, description, merchant, source";

function sortByDateDesc(list: Txn[]): Txn[] {
  return [...list].sort((a, b) =>
    a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0,
  );
}

function groupByDate(list: Txn[]): [string, Txn[]][] {
  const m = new Map<string, Txn[]>();
  for (const t of list) {
    const arr = m.get(t.occurred_on);
    if (arr) arr.push(t);
    else m.set(t.occurred_on, [t]);
  }
  return [...m.entries()];
}

export function TransactionsView({
  householdId,
  userId,
  categories,
  initial,
}: {
  householdId: string;
  userId: string;
  categories: Category[];
  initial: Txn[];
}) {
  const [txns, setTxns] = useState<Txn[]>(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(t: Txn) {
    setEditing(t);
    setDialogOpen(true);
  }

  async function handleSubmit(v: ExpenseValues) {
    setSubmitting(true);
    const supabase = createClient();
    const payload = {
      category_id: v.categoryId,
      occurred_on: v.occurredOn,
      amount: parseFloat(v.amount),
      description: v.description || null,
      merchant: v.merchant || null,
    };
    try {
      if (editing) {
        const { data, error } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", editing.id)
          .select(TXN_COLS)
          .single();
        if (error) throw error;
        setTxns((prev) =>
          sortByDateDesc(prev.map((t) => (t.id === data.id ? (data as Txn) : t))),
        );
        toast.success("ההוצאה עודכנה");
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert({
            ...payload,
            household_id: householdId,
            source: "manual",
            created_by: userId,
          })
          .select(TXN_COLS)
          .single();
        if (error) throw error;
        setTxns((prev) => sortByDateDesc([data as Txn, ...prev]));
        toast.success("ההוצאה נוספה");
      }
      setDialogOpen(false);
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
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", editing.id);
      if (error) throw error;
      setTxns((prev) => prev.filter((t) => t.id !== editing.id));
      toast.success("ההוצאה נמחקה");
      setDialogOpen(false);
    } catch {
      toast.error("מחיקה נכשלה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  const total = txns.reduce((s, t) => s + Number(t.amount), 0);

  // Group by date (txns are already sorted date-desc, so Map keeps that order).
  const groups = groupByDate(txns);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הוצאות</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {txns.length} רשומות · סה״כ {formatILS(total)}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          הוספה
        </Button>
      </header>

      {txns.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {groups.map(([date, items]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {formatDate(date)}
              </p>
              <div className="flex flex-col gap-1.5">
                {items.map((t) => {
                  const c = t.category_id
                    ? catById.get(t.category_id)
                    : undefined;
                  return (
                    <button
                      key={t.id}
                      onClick={() => openEdit(t)}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-right transition-colors hover:bg-accent/50"
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={categoryTintStyle(c?.color)}
                      >
                        {categoryIconElement(c?.icon)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {t.description || c?.name || "הוצאה"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c?.name ?? "ללא קטגוריה"}
                          {t.merchant ? ` · ${t.merchant}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatILS(Number(t.amount))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת הוצאה" : "הוספת הוצאה"}</DialogTitle>
            <DialogDescription>
              הזינו את פרטי ההוצאה. השמירה מיידית.
            </DialogDescription>
          </DialogHeader>
          <ExpenseForm
            key={editing?.id ?? "new"}
            categories={categories}
            initial={
              editing
                ? {
                    amount: String(editing.amount),
                    categoryId: editing.category_id ?? "",
                    occurredOn: editing.occurred_on,
                    description: editing.description ?? "",
                    merchant: editing.merchant ?? "",
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
        <Receipt className="size-6" />
      </div>
      <p className="font-medium">עדיין אין הוצאות</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        הוסיפו את ההוצאה הראשונה כדי להתחיל לעקוב מול היעדים.
      </p>
      <Button onClick={onAdd} className="mt-1">
        <Plus className="size-4" />
        הוספת הוצאה
      </Button>
    </div>
  );
}
