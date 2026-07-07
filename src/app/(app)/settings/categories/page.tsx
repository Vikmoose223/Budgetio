import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { firstOfMonthISO, monthLabel } from "@/lib/format";
import { CategoriesManager } from "./categories-manager";
import { ChevronRight } from "lucide-react";

export default async function CategoriesSettingsPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;
  const month = firstOfMonthISO();

  const [{ data: categories }, { data: goals }] = await Promise.all([
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

  const goalByCat = new Map(
    (goals ?? []).map((g) => [g.category_id, Number(g.target_amount)]),
  );
  const withGoals = (categories ?? []).map((c) => ({
    ...c,
    goal: goalByCat.get(c.id) ?? 0,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground"
          aria-label="חזרה להגדרות"
        >
          <ChevronRight className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">קטגוריות ויעדים</h1>
          <p className="text-sm text-muted-foreground">
            יעדים לחודש {monthLabel(month)}
          </p>
        </div>
      </div>

      <CategoriesManager
        householdId={householdId}
        month={month}
        categories={withGoals}
      />
    </div>
  );
}
