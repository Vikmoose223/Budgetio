import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InviteCode } from "./invite-code";
import { SpendingDonut } from "./spending-donut";
import { TrendChart } from "./trend-chart";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import {
  formatILS,
  firstOfMonthISO,
  addMonths,
  monthRange,
  monthLabel,
} from "@/lib/format";
import { summarizeMonth, monthlyExpenseTrend } from "@/lib/aggregate";
import {
  Users,
  PiggyBank,
  Plus,
  ChevronRight,
  ChevronLeft,
  Wallet,
} from "lucide-react";

function normalizeMonth(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}(-01)?$/.test(raw)) return `${raw.slice(0, 7)}-01`;
  return firstOfMonthISO();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;

  const month = normalizeMonth((await searchParams).month);
  const { start, endExclusive } = monthRange(month);
  const trendStart = addMonths(month, -5);

  const [
    { data: household },
    { data: members },
    { data: categories },
    { data: goals },
    { data: monthTxns },
    { data: trendTxns },
  ] = await Promise.all([
    supabase.from("households").select("name, invite_code").eq("id", householdId).single(),
    supabase.from("profiles").select("id, display_name").eq("household_id", householdId),
    supabase
      .from("categories")
      .select("id, name, icon, color, kind")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("budget_goals")
      .select("category_id, target_amount")
      .eq("household_id", householdId)
      .eq("month", month),
    supabase
      .from("transactions")
      .select("category_id, amount, occurred_on")
      .eq("household_id", householdId)
      .gte("occurred_on", start)
      .lt("occurred_on", endExclusive),
    supabase
      .from("transactions")
      .select("category_id, amount, occurred_on")
      .eq("household_id", householdId)
      .gte("occurred_on", trendStart)
      .lt("occurred_on", endExclusive),
  ]);

  if (!categories || categories.length === 0) redirect("/onboarding");

  const goalByCategory = new Map(
    (goals ?? []).map((g) => [g.category_id, Number(g.target_amount)]),
  );
  const summary = summarizeMonth(categories, monthTxns ?? [], goalByCategory);
  const trend = monthlyExpenseTrend(month, 6, categories, trendTxns ?? []);

  const donutData = summary.perCategory
    .filter((c) => c.category.kind === "expense" && c.spent > 0)
    .map((c) => ({
      name: c.category.name,
      value: c.spent,
      color: c.category.color ?? "chart-1",
    }));

  const remaining = summary.totalExpenseGoal - summary.totalExpenseSpent;
  const expenseRows = summary.perCategory.filter(
    (c) => c.category.kind === "expense",
  );
  const savingRows = summary.perCategory.filter(
    (c) => c.category.kind === "saving",
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
      {/* Month switcher */}
      <header className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{household?.name ?? "משק בית"}</p>
        <div className="flex items-center gap-1">
          {/* In RTL, "previous" points right */}
          <Link
            href={`/dashboard?month=${addMonths(month, -1).slice(0, 7)}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label="חודש קודם"
          >
            <ChevronRight className="size-4" />
          </Link>
          <span className="min-w-28 text-center text-sm font-semibold">
            {monthLabel(month)}
          </span>
          <Link
            href={`/dashboard?month=${addMonths(month, 1).slice(0, 7)}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label="חודש הבא"
          >
            <ChevronLeft className="size-4" />
          </Link>
        </div>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Wallet className="size-4" />}
          label="הוצאת החודש"
          value={formatILS(summary.totalExpenseSpent)}
        />
        <StatTile
          icon={<Wallet className="size-4" />}
          label={remaining >= 0 ? "נשאר מהתקציב" : "חריגה מהתקציב"}
          value={formatILS(Math.abs(remaining))}
          tone={remaining >= 0 ? "ok" : "danger"}
        />
        <StatTile
          icon={<PiggyBank className="size-4" />}
          label="חיסכון החודש"
          value={formatILS(summary.totalSavingSpent)}
          tone="accent"
        />
      </div>

      {/* Donut + breakdown */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">התפלגות הוצאות</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendingDonut data={donutData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">מול היעדים</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {expenseRows.map((row) => (
              <CategoryProgress key={row.category.id} row={row} />
            ))}
            {savingRows.length > 0 && (
              <div className="mt-1 border-t border-border pt-3">
                {savingRows.map((row) => (
                  <CategoryProgress key={row.category.id} row={row} saving />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">מגמת הוצאות (6 חודשים)</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} />
        </CardContent>
      </Card>

      {/* Add expense CTA */}
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-3 py-5 text-center sm:flex-row sm:justify-between sm:text-right">
          <p className="text-sm text-muted-foreground">
            רשמו הוצאות כדי לעדכן את התמונה החודשית.
          </p>
          <Link href="/transactions" className={cn(buttonVariants(), "shrink-0")}>
            <Plus className="size-4" />
            הוספת הוצאה
          </Link>
        </CardContent>
      </Card>

      {/* Household + invite */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" />
              חברי משק הבית
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {members?.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                  {(m.display_name ?? "?").slice(0, 1)}
                </span>
                {m.display_name ?? "משתמש"}
                {m.id === user.id && (
                  <span className="text-xs text-muted-foreground">(אתם)</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">הזמנת בן/בת הזוג</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              שתפו את הקוד כדי שיצטרפו לאותו משק בית:
            </p>
            <InviteCode code={household?.invite_code ?? ""} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "muted" | "ok" | "danger" | "accent";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-destructive/10 text-destructive"
      : tone === "ok"
        ? "bg-success/10 text-success"
        : tone === "accent"
          ? "bg-primary/10 text-primary"
          : "bg-accent text-accent-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className={cn("flex size-8 items-center justify-center rounded-lg", toneClass)}>
        {icon}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CategoryProgress({
  row,
  saving,
}: {
  row: { category: { name: string; icon: string | null; color: string | null }; spent: number; goal: number };
  saving?: boolean;
}) {
  const { category, spent, goal } = row;
  const pct = goal > 0 ? Math.min(100, (spent / goal) * 100) : 0;
  const over = goal > 0 && spent > goal;
  const barColor = saving
    ? "var(--success)"
    : over
      ? "var(--destructive)"
      : `var(--${category.color ?? "chart-1"})`;

  return (
    <div className="flex flex-col gap-1.5">
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
      </div>
      {goal > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(pct, spent > 0 ? 4 : 0)}%`, backgroundColor: barColor }}
          />
        </div>
      )}
    </div>
  );
}
