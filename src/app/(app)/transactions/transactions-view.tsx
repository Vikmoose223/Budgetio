"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpenseForm, type Category, type ExpenseValues } from "./expense-form";
import { MonthNav } from "@/components/month-nav";
import { findDuplicates, type DupExisting } from "@/lib/dedup";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import { formatILS, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Receipt, Search } from "lucide-react";

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
  month,
  categoryFilter,
}: {
  householdId: string;
  userId: string;
  categories: Category[];
  initial: Txn[];
  month: string;
  categoryFilter: { id: string; label: string } | null;
}) {
  const [txns, setTxns] = useState<Txn[]>(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  // When a new manual expense matches an existing one (same name+date+amount),
  // we pause and ask the user how to resolve it instead of inserting blindly.
  const [dupPrompt, setDupPrompt] = useState<{
    values: ExpenseValues;
    existing: DupExisting;
  } | null>(null);

  // When the month or category filter changes, the server component re-fetches
  // and passes fresh `initial`. This client component instance persists across
  // that navigation, so we must adopt the new server data — otherwise the list
  // stays frozen on the month it first mounted with (past bug: changing months
  // moved the picker but not the expenses). Reset during render (React's
  // recommended pattern) so there's no stale flash.
  const dataKey = `${month}|${categoryFilter?.id ?? ""}`;
  const [syncedKey, setSyncedKey] = useState(dataKey);
  if (syncedKey !== dataKey) {
    setSyncedKey(dataKey);
    setTxns(initial);
  }

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

  // Ask whether to remember a merchant → category mapping (learned rule).
  function promptRemember(merchant: string, categoryId: string) {
    const catName = catById.get(categoryId)?.name ?? "";
    toast(`לזכור ש"${merchant}" שייך ל"${catName}"?`, {
      duration: 8000,
      action: {
        label: "כן, זכור",
        onClick: async () => {
          const supabase = createClient();
          const { error } = await supabase.from("category_rules").upsert(
            { household_id: householdId, keyword: merchant, category_id: categoryId },
            { onConflict: "household_id,keyword" },
          );
          toast[error ? "error" : "success"](
            error ? "שמירת הכלל נכשלה" : "נשמר! נסווג כך אוטומטית בפעם הבאה",
          );
        },
      },
    });
  }

  // Insert a brand-new manual expense (optimistic list update).
  async function insertNew(v: ExpenseValues) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        category_id: v.categoryId,
        occurred_on: v.occurredOn,
        amount: parseFloat(v.amount),
        description: v.description || null,
        merchant: v.merchant || null,
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

  async function handleSubmit(v: ExpenseValues) {
    setSubmitting(true);
    const supabase = createClient();
    try {
      if (editing) {
        const { data, error } = await supabase
          .from("transactions")
          .update({
            category_id: v.categoryId,
            occurred_on: v.occurredOn,
            amount: parseFloat(v.amount),
            description: v.description || null,
            merchant: v.merchant || null,
          })
          .eq("id", editing.id)
          .select(TXN_COLS)
          .single();
        if (error) throw error;
        const changedCategory =
          v.categoryId && v.categoryId !== editing.category_id;
        const merchant = (v.merchant || editing.merchant || "").trim();
        setTxns((prev) =>
          sortByDateDesc(prev.map((t) => (t.id === data.id ? (data as Txn) : t))),
        );
        // Offer to remember this merchant → category for future imports.
        if (changedCategory && merchant) {
          promptRemember(merchant, v.categoryId);
        } else {
          toast.success("ההוצאה עודכנה");
        }
        setDialogOpen(false);
      } else {
        // Guard: is there already an expense with the same name+date+amount?
        const name = (v.merchant || v.description || "").trim();
        const { data: sameDate } = await supabase
          .from("transactions")
          .select("id, occurred_on, amount, merchant, description")
          .eq("household_id", householdId)
          .eq("occurred_on", v.occurredOn);
        const dup = findDuplicates(
          { occurredOn: v.occurredOn, amount: parseFloat(v.amount), name },
          (sameDate ?? []).map((e) => ({
            id: e.id,
            occurred_on: e.occurred_on,
            amount: Number(e.amount),
            merchant: e.merchant,
            description: e.description,
          })),
        )[0];
        if (dup) {
          // Hand off to the resolution dialog instead of inserting.
          setDupPrompt({ values: v, existing: dup });
          setDialogOpen(false);
        } else {
          await insertNew(v);
          setDialogOpen(false);
        }
      }
    } catch {
      toast.error("שמירה נכשלה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  // User chose to keep the new expense alongside the existing duplicate.
  async function resolveDupKeep() {
    if (!dupPrompt) return;
    setSubmitting(true);
    try {
      await insertNew(dupPrompt.values);
      setDupPrompt(null);
    } catch {
      toast.error("שמירה נכשלה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  // User chose to overwrite the existing expense with the new values.
  async function resolveDupReplace() {
    if (!dupPrompt) return;
    setSubmitting(true);
    const supabase = createClient();
    const v = dupPrompt.values;
    try {
      const { data, error } = await supabase
        .from("transactions")
        .update({
          category_id: v.categoryId,
          occurred_on: v.occurredOn,
          amount: parseFloat(v.amount),
          description: v.description || null,
          merchant: v.merchant || null,
        })
        .eq("id", dupPrompt.existing.id)
        .select(TXN_COLS)
        .single();
      if (error) throw error;
      setTxns((prev) =>
        sortByDateDesc(prev.map((t) => (t.id === data.id ? (data as Txn) : t))),
      );
      toast.success("ההוצאה הוחלפה");
      setDupPrompt(null);
    } catch {
      toast.error("החלפה נכשלה. נסו שוב.");
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

  // Client-side text search over merchant/description.
  const q = query.trim().toLowerCase();
  const visible = q
    ? txns.filter(
        (t) =>
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.merchant ?? "").toLowerCase().includes(q),
      )
    : txns;

  const total = visible.reduce((s, t) => s + Number(t.amount), 0);

  // Group by date (txns are already sorted date-desc, so Map keeps that order).
  const groups = groupByDate(visible);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הוצאות</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {visible.length} רשומות · סה״כ {formatILS(total)}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          הוספה
        </Button>
      </header>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <MonthNav
          month={month}
          basePath="/transactions"
          params={categoryFilter ? { category: categoryFilter.id } : undefined}
        />
        {categoryFilter && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">
              {categoryFilter.label}
            </span>
            <Link
              href={`/transactions?month=${month.slice(0, 7)}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              הצג הכול
            </Link>
          </div>
        )}
      </div>

      {txns.length > 0 && (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי תיאור או בית עסק"
            className="pr-9"
          />
        </div>
      )}

      {txns.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          לא נמצאו תוצאות
        </p>
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

      {/* Duplicate resolution: a new manual expense matched an existing one. */}
      <Dialog
        open={dupPrompt !== null}
        onOpenChange={(o) => {
          if (!o) setDupPrompt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>נמצאה הוצאה זהה</DialogTitle>
            <DialogDescription>
              כבר קיימת הוצאה עם אותו שם, תאריך וסכום. מה תרצו לעשות?
            </DialogDescription>
          </DialogHeader>
          {dupPrompt && (
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {dupPrompt.existing.merchant ||
                      dupPrompt.existing.description ||
                      "הוצאה"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(dupPrompt.existing.occurred_on)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatILS(Number(dupPrompt.existing.amount))}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={resolveDupReplace}
              disabled={submitting}
              className="flex-1"
            >
              החלף קיים
            </Button>
            <Button
              variant="outline"
              onClick={resolveDupKeep}
              disabled={submitting}
              className="flex-1"
            >
              שמור שניהם
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDupPrompt(null)}
              disabled={submitting}
            >
              ביטול
            </Button>
          </div>
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
