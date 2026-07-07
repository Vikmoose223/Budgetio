"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";
import { Loader2, Trash2 } from "lucide-react";

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: string;
};

export type ExpenseValues = {
  amount: string;
  categoryId: string;
  occurredOn: string;
  description: string;
  merchant: string;
};

export function ExpenseForm({
  categories,
  initial,
  onSubmit,
  onDelete,
  submitting,
}: {
  categories: Category[];
  initial?: Partial<ExpenseValues>;
  onSubmit: (v: ExpenseValues) => void;
  onDelete?: () => void;
  submitting: boolean;
}) {
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? categories[0]?.id ?? "",
  );
  const [occurredOn, setOccurredOn] = useState(
    initial?.occurredOn ?? todayISO(),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setErr("הזינו סכום גדול מאפס.");
      return;
    }
    if (!categoryId) {
      setErr("בחרו קטגוריה.");
      return;
    }
    setErr(null);
    onSubmit({
      amount,
      categoryId,
      occurredOn,
      description: description.trim(),
      merchant: merchant.trim(),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">סכום</Label>
          <div className="relative">
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))
              }
              placeholder="0"
              className="pl-7 text-left"
              dir="ltr"
              autoFocus
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ₪
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">תאריך</Label>
          <Input
            id="date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">קטגוריה</Label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">תיאור</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="למשל: קניות בסופר"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="merchant">בית עסק (לא חובה)</Label>
        <Input
          id="merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="למשל: שופרסל"
        />
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="mt-1 flex items-center gap-2">
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          שמירה
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDelete}
            disabled={submitting}
            aria-label="מחיקה"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
