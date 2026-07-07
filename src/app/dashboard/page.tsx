import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteCode } from "./invite-code";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import { formatILS, firstOfMonthISO, monthLabel } from "@/lib/format";
import { Users, Target, PiggyBank } from "lucide-react";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;
  const month = firstOfMonthISO();

  const [{ data: household }, { data: members }, { data: categories }, { data: goals }] =
    await Promise.all([
      supabase.from("households").select("name, invite_code").eq("id", householdId).single(),
      supabase.from("profiles").select("id, display_name").eq("household_id", householdId),
      supabase
        .from("categories")
        .select("id, name, icon, color, kind, sort_order")
        .eq("household_id", householdId)
        .order("sort_order"),
      supabase
        .from("budget_goals")
        .select("category_id, target_amount")
        .eq("household_id", householdId)
        .eq("month", month),
    ]);

  // No categories yet → finish onboarding first.
  if (!categories || categories.length === 0) redirect("/onboarding");

  const goalByCategory = new Map(
    (goals ?? []).map((g) => [g.category_id, Number(g.target_amount)]),
  );
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const savingCats = categories.filter((c) => c.kind === "saving");
  const totalExpenseGoal = expenseCats.reduce(
    (sum, c) => sum + (goalByCategory.get(c.id) ?? 0),
    0,
  );
  const totalSavingGoal = savingCats.reduce(
    (sum, c) => sum + (goalByCategory.get(c.id) ?? 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{household?.name ?? "משק בית"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{monthLabel(month)}</h1>
      </header>

      {/* Goal summary */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<Target className="size-4" />}
          label="יעד הוצאות חודשי"
          value={formatILS(totalExpenseGoal)}
        />
        <StatTile
          icon={<PiggyBank className="size-4" />}
          label="יעד חיסכון חודשי"
          value={formatILS(totalSavingGoal)}
          accent
        />
      </div>

      {/* Goals per category */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">היעדים שלכם</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {[...expenseCats, ...savingCats].map((c) => {
            const goal = goalByCategory.get(c.id);
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg px-1 py-2"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={categoryTintStyle(c.color)}
                >
                  {categoryIconElement(c.icon)}
                </span>
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {goal ? formatILS(goal) : "—"}
                </span>
              </div>
            );
          })}
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

      <Card className="mt-4">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          בקרוב: הזנת הוצאות, ייבוא מהבנק ומעקב מול היעדים. 🚧
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div
        className={`flex size-8 items-center justify-center rounded-lg ${
          accent ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
        }`}
      >
        {icon}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
