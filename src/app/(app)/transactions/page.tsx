import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { firstOfMonthISO, periodRange } from "@/lib/format";
import { TransactionsView } from "./transactions-view";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; month?: string }>;
}) {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;

  const sp = await searchParams;
  // Always scope to a budget month (default: current) so the total matches the
  // dashboard. Uses the household's billing-cycle start day.
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "")
    ? `${sp.month}-01`
    : firstOfMonthISO();

  const [{ data: categories }, { data: household }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, icon, color, kind")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("households")
      .select("month_start_day")
      .eq("id", householdId)
      .single(),
  ]);
  if (!categories || categories.length === 0) redirect("/onboarding");

  const { start, endExclusive } = periodRange(month, household?.month_start_day ?? 1);

  const wantUncategorized = sp.category === "none";
  const filterCategory =
    sp.category && !wantUncategorized
      ? categories.find((c) => c.id === sp.category)
      : undefined;

  let query = supabase
    .from("transactions")
    .select("id, category_id, occurred_on, amount, description, merchant, source")
    .eq("household_id", householdId)
    .gte("occurred_on", start)
    .lt("occurred_on", endExclusive)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (wantUncategorized) query = query.is("category_id", null);
  else if (filterCategory) query = query.eq("category_id", filterCategory.id);

  const { data: transactions } = await query;

  const categoryFilter = wantUncategorized
    ? { id: "none", label: "לא מסווג" }
    : filterCategory
      ? { id: filterCategory.id, label: filterCategory.name }
      : null;

  return (
    <TransactionsView
      householdId={householdId}
      userId={user.id}
      categories={categories}
      initial={transactions ?? []}
      month={month}
      categoryFilter={categoryFilter}
    />
  );
}
