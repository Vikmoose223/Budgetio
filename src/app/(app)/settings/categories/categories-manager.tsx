"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_ICONS,
  categoryIconElement,
  categoryTintStyle,
} from "@/lib/categories";
import { addMonths, monthLabel, formatILS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  ChevronUp,
  ChevronDown,
  Loader2,
  Trash2,
  CalendarPlus,
} from "lucide-react";

type Cat = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: "expense" | "saving";
  sort_order: number;
  goal: number;
};

const ICON_CHOICES = Object.keys(CATEGORY_ICONS);
const COLOR_CHOICES = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
  "muted-foreground",
];

export function CategoriesManager({
  householdId,
  month,
  categories,
}: {
  householdId: string;
  month: string;
  categories: Cat[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const [copying, setCopying] = useState(false);

  const expense = categories.filter((c) => c.kind === "expense");
  const saving = categories.filter((c) => c.kind === "saving");

  async function move(cat: Cat, dir: -1 | 1) {
    const group = categories.filter((c) => c.kind === cat.kind);
    const idx = group.findIndex((c) => c.id === cat.id);
    const target = group[idx + dir];
    if (!target) return;
    const supabase = createClient();
    await Promise.all([
      supabase.from("categories").update({ sort_order: target.sort_order }).eq("id", cat.id),
      supabase.from("categories").update({ sort_order: cat.sort_order }).eq("id", target.id),
    ]);
    router.refresh();
  }

  async function copyGoalsToNextMonth() {
    const next = addMonths(month, 1);
    const rows = categories
      .filter((c) => c.goal > 0)
      .map((c) => ({
        household_id: householdId,
        category_id: c.id,
        month: next,
        target_amount: c.goal,
      }));
    if (rows.length === 0) return toast.error("אין יעדים להעתיק.");
    setCopying(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("budget_goals")
      .upsert(rows, { onConflict: "category_id,month" });
    setCopying(false);
    if (error) return toast.error("ההעתקה נכשלה.");
    toast.success(`היעדים הועתקו ל${monthLabel(next)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="outline"
        onClick={copyGoalsToNextMonth}
        disabled={copying}
        className="self-start"
      >
        {copying ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CalendarPlus className="size-4" />
        )}
        העתקת היעדים לחודש הבא
      </Button>

      <Section title="הוצאות">
        {expense.map((c, i) => (
          <Row
            key={c.id}
            cat={c}
            onEdit={() => setEditing(c)}
            onUp={i > 0 ? () => move(c, -1) : undefined}
            onDown={i < expense.length - 1 ? () => move(c, 1) : undefined}
          />
        ))}
      </Section>

      {saving.length > 0 && (
        <Section title="חיסכון">
          {saving.map((c, i) => (
            <Row
              key={c.id}
              cat={c}
              onEdit={() => setEditing(c)}
              onUp={i > 0 ? () => move(c, -1) : undefined}
              onDown={i < saving.length - 1 ? () => move(c, 1) : undefined}
            />
          ))}
        </Section>
      )}

      <Button onClick={() => setEditing("new")} className="self-start">
        <Plus className="size-4" />
        הוספת קטגוריה
      </Button>

      {editing !== null && (
        <CategoryDialog
          householdId={householdId}
          month={month}
          categories={categories}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({
  cat,
  onEdit,
  onUp,
  onDown,
}: {
  cat: Cat;
  onEdit: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex flex-col">
          <button
            onClick={onUp}
            disabled={!onUp}
            className="text-muted-foreground disabled:opacity-30"
            aria-label="הזזה למעלה"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            onClick={onDown}
            disabled={!onDown}
            className="text-muted-foreground disabled:opacity-30"
            aria-label="הזזה למטה"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
        <button onClick={onEdit} className="flex flex-1 items-center gap-3 text-right">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={categoryTintStyle(cat.color)}
          >
            {categoryIconElement(cat.icon)}
          </span>
          <span className="flex-1 font-medium">{cat.name}</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {cat.goal > 0 ? formatILS(cat.goal) : "ללא יעד"}
          </span>
        </button>
      </CardContent>
    </Card>
  );
}

function CategoryDialog({
  householdId,
  month,
  categories,
  initial,
  onClose,
}: {
  householdId: string;
  month: string;
  categories: Cat[];
  initial: Cat | "new";
  onClose: () => void;
}) {
  const router = useRouter();
  const isNew = initial === "new";
  const cat = isNew ? null : initial;

  const [name, setName] = useState(cat?.name ?? "");
  const [kind, setKind] = useState<"expense" | "saving">(cat?.kind ?? "expense");
  const [icon, setIcon] = useState(cat?.icon ?? ICON_CHOICES[0]);
  const [color, setColor] = useState(cat?.color ?? "chart-1");
  const [goal, setGoal] = useState(cat?.goal ? String(cat.goal) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("יש להזין שם.");
    setBusy(true);
    const supabase = createClient();
    const goalAmount = parseFloat(goal || "0") || 0;
    try {
      let categoryId = cat?.id;
      if (isNew) {
        const maxSort = Math.max(0, ...categories.map((c) => c.sort_order));
        const { data, error } = await supabase
          .from("categories")
          .insert({
            household_id: householdId,
            name: name.trim(),
            icon,
            color,
            kind,
            sort_order: maxSort + 1,
          })
          .select("id")
          .single();
        if (error) throw error;
        categoryId = data.id;
      } else {
        const { error } = await supabase
          .from("categories")
          .update({ name: name.trim(), icon, color, kind })
          .eq("id", cat!.id);
        if (error) throw error;
      }

      if (goalAmount > 0) {
        await supabase.from("budget_goals").upsert(
          {
            household_id: householdId,
            category_id: categoryId!,
            month,
            target_amount: goalAmount,
          },
          { onConflict: "category_id,month" },
        );
      } else if (!isNew) {
        await supabase
          .from("budget_goals")
          .delete()
          .eq("category_id", cat!.id)
          .eq("month", month);
      }

      toast.success(isNew ? "הקטגוריה נוספה" : "הקטגוריה עודכנה");
      onClose();
      router.refresh();
    } catch {
      toast.error("השמירה נכשלה.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!cat) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) {
      setBusy(false);
      return toast.error("המחיקה נכשלה.");
    }
    toast.success("הקטגוריה נמחקה");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "קטגוריה חדשה" : "עריכת קטגוריה"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="catName">שם</Label>
            <Input
              id="catName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind("expense")}
              className={`flex-1 rounded-lg border py-1.5 text-sm ${kind === "expense" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              הוצאה
            </button>
            <button
              type="button"
              onClick={() => setKind("saving")}
              className={`flex-1 rounded-lg border py-1.5 text-sm ${kind === "saving" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              חיסכון
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <Label>אייקון</Label>
            <div className="grid grid-cols-8 gap-1.5">
              {ICON_CHOICES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  className={`flex aspect-square items-center justify-center rounded-lg border ${icon === name ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {categoryIconElement(name)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>צבע</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`size-7 rounded-full ring-offset-2 ring-offset-background ${color === c ? "ring-2 ring-ring" : ""}`}
                  style={{ backgroundColor: `var(--${c})` }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="catGoal">יעד חודשי</Label>
            <div className="relative">
              <Input
                id="catGoal"
                inputMode="decimal"
                value={goal}
                onChange={(e) =>
                  setGoal(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))
                }
                placeholder="0"
                className="pl-7 text-left"
                dir="ltr"
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ₪
              </span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <Button onClick={save} disabled={busy} className="flex-1">
              {busy && <Loader2 className="size-4 animate-spin" />}
              שמירה
            </Button>
            {!isNew && (
              <Button
                variant="destructive"
                size="icon"
                onClick={remove}
                disabled={busy}
                aria-label="מחיקה"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
