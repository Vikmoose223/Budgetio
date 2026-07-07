"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_CATEGORIES,
  CUSTOM_ICON_CHOICES,
  categoryIconElement,
  categoryTintStyle,
  type CategoryKind,
} from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, Loader2, Plus } from "lucide-react";

type Row = {
  key: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  selected: boolean;
  amount: string;
};

const CHART_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-8"];

export function CategorySetup({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    DEFAULT_CATEGORIES.map((c, i) => ({
      key: `default-${i}`,
      name: c.name,
      icon: c.icon,
      color: c.color,
      kind: c.kind,
      selected: c.selected,
      amount: "",
    })),
  );
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenses = rows.filter((r) => r.kind === "expense");
  const savings = rows.filter((r) => r.kind === "saving");
  const selectedCount = rows.filter((r) => r.selected).length;

  function toggle(key: string) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)),
    );
  }

  function setAmount(key: string, amount: string) {
    // Keep only digits and a single decimal point.
    const clean = amount.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, amount: clean } : r)));
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    const used = rows.filter((r) => r.kind === "expense").length;
    setRows((rs) => [
      ...rs,
      {
        key: `custom-${Date.now()}`,
        name,
        icon: CUSTOM_ICON_CHOICES[used % CUSTOM_ICON_CHOICES.length],
        color: CHART_TOKENS[used % CHART_TOKENS.length],
        kind: "expense",
        selected: true,
        amount: "",
      },
    ]);
    setCustomName("");
  }

  async function handleSubmit() {
    setError(null);
    const chosen = rows.filter((r) => r.selected && r.name.trim());
    if (chosen.length === 0) {
      setError("בחרו לפחות קטגוריה אחת כדי להמשיך.");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    try {
      const { error: catErr } = await supabase.from("categories").insert(
        chosen.map((r, i) => ({
          household_id: householdId,
          name: r.name.trim(),
          icon: r.icon,
          color: r.color,
          kind: r.kind,
          sort_order: i,
          monthly_goal: parseFloat(r.amount || "0") || 0,
        })),
      );
      if (catErr) throw catErr;

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "משהו השתבש. נסו שוב.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="הוצאות חודשיות" hint="בחרו קטגוריות והגדירו יעד חודשי לכל אחת (אפשר גם בלי סכום).">
        <div className="flex flex-col gap-2">
          {expenses.map((r) => (
            <CategoryRow key={r.key} row={r} onToggle={toggle} onAmount={setAmount} />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="הוספת קטגוריה משלכם"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" variant="outline" size="icon" onClick={addCustom} aria-label="הוספה">
            <Plus className="size-4" />
          </Button>
        </div>
      </Section>

      <Section title="חיסכון" hint="כמה תרצו לחסוך בכל חודש?">
        <div className="flex flex-col gap-2">
          {savings.map((r) => (
            <CategoryRow key={r.key} row={r} onToggle={toggle} onAmount={setAmount} />
          ))}
        </div>
      </Section>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={handleSubmit} disabled={loading} size="lg" className="w-full">
        {loading && <Loader2 className="size-4 animate-spin" />}
        סיום · {selectedCount} קטגוריות
      </Button>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

function CategoryRow({
  row,
  onToggle,
  onAmount,
}: {
  row: Row;
  onToggle: (key: string) => void;
  onAmount: (key: string, amount: string) => void;
}) {
  return (
    <Card className={row.selected ? "border-primary/40 py-0" : "py-0"}>
      <CardContent className="p-2.5">
        <button
          type="button"
          onClick={() => onToggle(row.key)}
          aria-pressed={row.selected}
          className="flex w-full items-center gap-3 text-right"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={categoryTintStyle(row.color)}
          >
            {categoryIconElement(row.icon)}
          </span>
          <span className="flex-1 font-medium">{row.name}</span>
          <span
            className={`flex size-5 items-center justify-center rounded-full border ${
              row.selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {row.selected && <Check className="size-3.5" />}
          </span>
        </button>

        {row.selected && (
          <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
            <span className="text-xs text-muted-foreground">יעד חודשי</span>
            <div className="relative flex-1">
              <Input
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => onAmount(row.key, e.target.value)}
                placeholder="0"
                className="pl-7 text-left"
                dir="ltr"
                aria-label={`יעד חודשי עבור ${row.name}`}
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ₪
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
