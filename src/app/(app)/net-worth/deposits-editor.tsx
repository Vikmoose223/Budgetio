"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatILS, formatDate, todayISO, firstOfMonthISO } from "@/lib/format";
import { expandRecurringFlow, netContributed } from "@/lib/networth/recurring-flows";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Repeat } from "lucide-react";

export type FlowRow = {
  id: string;
  occurred_on: string;
  amount: number;
  note: string | null;
};

export type RuleRow = {
  id: string;
  amount: number;
  day_of_month: number;
  start_month: string;
  end_month: string | null;
  note: string | null;
};

/**
 * Deposits and withdrawals for one account — the thing that turns "the balance
 * went up" into an actual return.
 *
 * A standing rule covers the regular monthly contribution, because typing
 * thirty near-identical rows is friction that stops the data being entered at
 * all. One-off entries sit alongside it for bonuses and withdrawals.
 */
export function DepositsEditor({
  accountId,
  flows,
  rules,
}: {
  accountId: string;
  flows: FlowRow[];
  rules: RuleRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const today = todayISO();

  const [saving, setSaving] = useState(false);
  const [addingFlow, setAddingFlow] = useState(false);
  const [addingRule, setAddingRule] = useState(false);

  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState("");

  const [ruleAmount, setRuleAmount] = useState("");
  const [ruleDay, setRuleDay] = useState("10");
  const [ruleStart, setRuleStart] = useState(firstOfMonthISO());
  const [err, setErr] = useState<string | null>(null);

  const signed = (v: string) =>
    v.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "").replace(/(\..*)\./g, "$1");

  // What the rules actually add up to, so the effect is visible before saving.
  const expanded = rules.flatMap((r) =>
    expandRecurringFlow(
      {
        amount: Number(r.amount),
        day_of_month: r.day_of_month,
        start_month: r.start_month,
        end_month: r.end_month,
      },
      today,
    ),
  );
  const total = netContributed([
    ...flows.map((f) => ({ occurred_on: f.occurred_on, amount: Number(f.amount) })),
    ...expanded,
  ]);

  async function saveFlow() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt === 0) {
      setErr("הזינו סכום. מספר שלילי = משיכה.");
      return;
    }
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("account_flows").insert({
      account_id: accountId,
      occurred_on: occurredOn,
      amount: amt,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("שמירה נכשלה");
      return;
    }
    toast.success("נשמר");
    setAmount("");
    setNote("");
    setAddingFlow(false);
    router.refresh();
  }

  async function saveRule() {
    const amt = parseFloat(ruleAmount);
    if (!Number.isFinite(amt) || amt === 0) {
      setErr("הזינו סכום להפקדה החודשית.");
      return;
    }
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("recurring_flows").insert({
      account_id: accountId,
      amount: amt,
      day_of_month: Math.min(Math.max(parseInt(ruleDay, 10) || 1, 1), 28),
      start_month: ruleStart,
    });
    setSaving(false);
    if (error) {
      toast.error("שמירת הכלל נכשלה");
      return;
    }
    toast.success("הכלל נשמר");
    setRuleAmount("");
    setAddingRule(false);
    router.refresh();
  }

  async function remove(table: "account_flows" | "recurring_flows", id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      toast.error("מחיקה נכשלה");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground">סה״כ הופקד נטו</p>
        <p className="text-xl font-bold tabular-nums">{formatILS(total)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          זה מה שהופך את ההפרש בין היתרה להפקדות לתשואה אמיתית.
        </p>
      </div>

      {/* --- Standing rules ------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Repeat className="size-3" />
          הפקדה חודשית קבועה
        </p>

        {rules.map((r) => {
          const count = expandRecurringFlow(
            {
              amount: Number(r.amount),
              day_of_month: r.day_of_month,
              start_month: r.start_month,
              end_month: r.end_month,
            },
            today,
          ).length;
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                {formatILS(Number(r.amount))} בכל {r.day_of_month} לחודש
                <span className="block text-xs text-muted-foreground">
                  מ־{formatDate(r.start_month)} · {count} הפקדות עד היום
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove("recurring_flows", r.id)}
                aria-label="מחיקת כלל"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}

        {addingRule ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">סכום חודשי</Label>
                <Input
                  value={ruleAmount}
                  onChange={(e) => setRuleAmount(signed(e.target.value))}
                  placeholder="2000"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">ביום</Label>
                <Input
                  value={ruleDay}
                  onChange={(e) => setRuleDay(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">החל מ</Label>
                <Input
                  type="date"
                  value={ruleStart}
                  onChange={(e) => setRuleStart(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRule} disabled={saving} size="sm" className="flex-1">
                {saving && <Loader2 className="size-4 animate-spin" />}
                שמירה
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingRule(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddingRule(true)}>
            <Plus className="size-4" />
            הוספת כלל קבוע
          </Button>
        )}
      </div>

      {/* --- One-off entries ------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">הפקדות ומשיכות בודדות</p>

        {flows.length > 0 &&
          [...flows]
            .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
            .map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1 truncate">
                  {f.note || (Number(f.amount) >= 0 ? "הפקדה" : "משיכה")}
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(f.occurred_on)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatILS(Number(f.amount))}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove("account_flows", f.id)}
                  aria-label="מחיקה"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}

        {addingFlow ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">סכום (שלילי = משיכה)</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(signed(e.target.value))}
                  placeholder="5000"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">תאריך</Label>
                <Input
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הערה (לא חובה)"
            />
            <div className="flex gap-2">
              <Button onClick={saveFlow} disabled={saving} size="sm" className="flex-1">
                {saving && <Loader2 className="size-4 animate-spin" />}
                שמירה
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingFlow(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddingFlow(true)}>
            <Plus className="size-4" />
            הוספת הפקדה
          </Button>
        )}
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
