"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";
import { INCOME_SOURCE_LABELS, type IncomeSource } from "@/lib/income";
import { Loader2, Trash2 } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export type IncomeValues = {
  amount: string;
  source: IncomeSource;
  occurredOn: string;
  description: string;
  ownerProfileId: string;
  recurring: boolean;
};

export type Member = { id: string; display_name: string | null };

export function IncomeForm({
  members,
  initial,
  onSubmit,
  onDelete,
  submitting,
}: {
  members: Member[];
  initial?: Partial<IncomeValues>;
  onSubmit: (v: IncomeValues) => void;
  onDelete?: () => void;
  submitting: boolean;
}) {
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [source, setSource] = useState<IncomeSource>(initial?.source ?? "salary");
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ownerProfileId, setOwnerProfileId] = useState(initial?.ownerProfileId ?? "");
  const [recurring, setRecurring] = useState(initial?.recurring ?? true);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setErr("הזינו סכום גדול מאפס.");
      return;
    }
    setErr(null);
    onSubmit({
      amount,
      source,
      occurredOn,
      description: description.trim(),
      ownerProfileId,
      recurring,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="income-amount">סכום</Label>
          <div className="relative">
            <Input
              id="income-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"),
                )
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
          <Label htmlFor="income-date">תאריך</Label>
          <Input
            id="income-date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="income-source">מקור</Label>
          <select
            id="income-source"
            value={source}
            onChange={(e) => setSource(e.target.value as IncomeSource)}
            className={SELECT_CLASS}
          >
            {Object.entries(INCOME_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="income-owner">שייך ל</Label>
          <select
            id="income-owner"
            value={ownerProfileId}
            onChange={(e) => setOwnerProfileId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">משותף</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name ?? "בן/בת זוג"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="income-description">תיאור</Label>
        <Input
          id="income-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="למשל: משכורת יולי"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          className="size-4 rounded border-input accent-primary"
        />
        הכנסה חודשית קבועה
      </label>

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
