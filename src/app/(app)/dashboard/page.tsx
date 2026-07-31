import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InviteCode } from "@/components/invite-code";
import { SpendingDonut } from "./spending-donut";
import { TrendChart } from "./trend-chart";
import { MonthNav } from "@/components/month-nav";
import { CategoryBreakdown } from "./category-breakdown";
import {
  formatILS,
  todayISO,
  budgetMonthOf,
  addMonths,
  periodRange,
} from "@/lib/format";
import { summarizeMonth, monthlyExpenseTrend } from "@/lib/aggregate";
import { summarizeIncome, cashFlow, INCOME_SOURCE_LABELS } from "@/lib/income";
import { generateInsights, type Insight } from "@/lib/insights";
import {
  Users,
  PiggyBank,
  Plus,
  Wallet,
  ArrowUp,
  ArrowDown,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";

// A valid ?month=YYYY-MM wins; otherwise default to the budget period that
// contains today (which, with a billing-cycle start day, may be last month).
function resolveMonth(raw: string | undefined, startDay: number): string {
  if (raw && /^\d{4}-\d{2}(-01)?$/.test(raw)) return `${raw.slice(0, 7)}-01`;
  return budgetMonthOf(todayISO(), startDay);
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

  const { data: household } = await supabase
    .from("households")
    .select("name, invite_code, month_start_day")
    .eq("id", householdId)
    .single();
  const startDay = household?.month_start_day ?? 1;
  const month = resolveMonth((await searchParams).month, startDay);
  const { start, endExclusive } = periodRange(month, startDay);
  const trendStart = periodRange(addMonths(month, -5), startDay).start;

  const [
    { data: members },
    { data: categories },
    { data: monthTxns },
    { data: trendTxns },
    { data: monthIncomes },
  ] = await Promise.all([
    supabase.from("profiles").select("id, display_name").eq("household_id", householdId),
    supabase
      .from("categories")
      .select("id, name, icon, color, kind, monthly_goal")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select("id, category_id, amount, occurred_on, description, merchant")
      .eq("household_id", householdId)
      .gte("occurred_on", start)
      .lt("occurred_on", endExclusive)
      .order("occurred_on", { ascending: false }),
    supabase
      .from("transactions")
      .select("category_id, amount, occurred_on")
      .eq("household_id", householdId)
      .gte("occurred_on", trendStart)
      .lt("occurred_on", endExclusive),
    supabase
      .from("incomes")
      .select("amount, occurred_on, source, owner_profile_id, recurring")
      .eq("household_id", householdId)
      .gte("occurred_on", start)
      .lt("occurred_on", endExclusive),
  ]);

  if (!categories || categories.length === 0) redirect("/onboarding");

  // Goals are a fixed value per category (same every month).
  const goalByCategory = new Map(
    categories.map((c) => [c.id, Number(c.monthly_goal)]),
  );
  const summary = summarizeMonth(categories, monthTxns ?? [], goalByCategory);
  const trend = monthlyExpenseTrend(month, 6, categories, trendTxns ?? [], startDay);

  // Previous month's total (the point right before the current one in the trend).
  const prevExpenseTotal = trend.length >= 2 ? trend[trend.length - 2].total : null;
  const spendDiff = summary.totalExpenseSpent - (prevExpenseTotal ?? 0);
  const spendChange =
    prevExpenseTotal && prevExpenseTotal > 0
      ? { pct: Math.round((Math.abs(spendDiff) / prevExpenseTotal) * 100), up: spendDiff > 0 }
      : null;
  const insights = generateInsights({ summary, prevExpenseTotal });

  const donutData = summary.perCategory
    .filter((c) => c.category.kind === "expense" && c.spent > 0)
    .map((c) => ({
      name: c.category.name,
      value: c.spent,
      color: c.category.color ?? "chart-1",
    }));

  const remaining = summary.totalExpenseGoal - summary.totalExpenseSpent;

  // Income against this month's spending. Only shown once income is tracked —
  // an empty income table shouldn't put a permanent ₪0 tile on the dashboard.
  const incomeSummary = summarizeIncome(monthIncomes ?? []);
  const flow = cashFlow(
    incomeSummary.total,
    summary.totalExpenseSpent + summary.totalSavingSpent,
  );
  const hasIncome = (monthIncomes ?? []).length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
      {/* Month switcher */}
      <header className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{household?.name ?? "משק בית"}</p>
        <MonthNav month={month} basePath="/dashboard" />
      </header>

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="mb-4 animate-in fade-in duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" />
              תובנות
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {insights.map((ins) => (
              <InsightRow key={ins.id} insight={ins} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Wallet className="size-4" />}
          label="הוצאת החודש"
          value={formatILS(summary.totalExpenseSpent)}
          change={spendChange}
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

      {/* Income vs expenses */}
      {hasIncome && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownLeft className="size-4 text-success" />
              הכנסות מול הוצאות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">הכנסות</p>
                <p className="text-lg font-bold tabular-nums text-success">
                  {formatILS(flow.income)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">הוצאות</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatILS(flow.expenses)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {flow.net >= 0 ? "נשאר" : "גירעון"}
                </p>
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    flow.net >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatILS(Math.abs(flow.net))}
                </p>
              </div>
            </div>

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
                    ? `חסכתם ${Math.round(flow.savingsRate * 100)}% מההכנסה החודש`
                    : `ההוצאות גבוהות ב-${Math.round(
                        (flow.spentShare - 1) * 100,
                      )}% מההכנסה`}
                </p>
              </>
            )}

            {incomeSummary.bySource.length > 1 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {incomeSummary.bySource.map((s) => (
                  <span
                    key={s.source}
                    className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                  >
                    {INCOME_SOURCE_LABELS[s.source]} {formatILS(s.amount)}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
          <CardContent>
            <CategoryBreakdown
              perCategory={summary.perCategory}
              uncategorizedSpent={summary.uncategorizedSpent}
              transactions={monthTxns ?? []}
              month={month}
            />
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
  change,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "muted" | "ok" | "danger" | "accent";
  change?: { pct: number; up: boolean } | null;
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
      {change && (
        // For spending, up = more spent = worse (red); down = good (green).
        <p
          className={cn(
            "mt-1 flex items-center gap-0.5 text-xs font-medium",
            change.up ? "text-destructive" : "text-success",
          )}
        >
          {change.up ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
          {change.pct}% מהחודש הקודם
        </p>
      )}
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const { tone } = insight;
  const chip =
    tone === "warning"
      ? "bg-destructive/10 text-destructive"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-primary/10 text-primary";
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          chip,
        )}
      >
        {tone === "warning" ? (
          <AlertTriangle className="size-4" />
        ) : tone === "success" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Lightbulb className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{insight.title}</p>
        <p className="text-sm text-muted-foreground">{insight.text}</p>
      </div>
    </div>
  );
}

