import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todayISO, budgetMonthOf, periodRange } from "@/lib/format";
import { TransactionsView } from "./transactions-view";
import type { Segment } from "./category-segments";

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

  const [{ data: categories }, { data: household }, { data: members }] =
    await Promise.all([
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
      supabase
        .from("profiles")
        .select("id, display_name")
        .eq("household_id", householdId),
    ]);
  if (!categories || categories.length === 0) redirect("/onboarding");

  // Always scope to a budget month (default: the period containing today, which
  // with a billing-cycle start day may be last calendar month) so the total
  // matches the dashboard.
  const startDay = household?.month_start_day ?? 1;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "")
    ? `${sp.month}-01`
    : budgetMonthOf(todayISO(), startDay);

  const { start, endExclusive } = periodRange(month, startDay);

  const wantUncategorized = sp.category === "none";
  const filterCategory =
    sp.category && !wantUncategorized
      ? categories.find((c) => c.id === sp.category)
      : undefined;

  let query = supabase
    .from("transactions")
    .select(
      "id, category_id, occurred_on, amount, description, merchant, source, is_fixed",
    )
    .eq("household_id", householdId)
    .gte("occurred_on", start)
    .lt("occurred_on", endExclusive)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (wantUncategorized) query = query.is("category_id", null);
  else if (filterCategory) query = query.eq("category_id", filterCategory.id);

  // The category breakdown and the income comparison both describe the whole
  // month, so they need a second, unfiltered read rather than the filtered list.
  const [{ data: transactions }, { data: monthTxns }, { data: incomes }] =
    await Promise.all([
      query,
      supabase
        .from("transactions")
        .select("category_id, amount")
        .eq("household_id", householdId)
        .gte("occurred_on", start)
        .lt("occurred_on", endExclusive),
      supabase
        .from("incomes")
        .select(
          "id, occurred_on, amount, source, description, owner_profile_id, recurring",
        )
        .eq("household_id", householdId)
        .gte("occurred_on", start)
        .lt("occurred_on", endExclusive)
        .order("occurred_on", { ascending: false }),
    ]);

  // --- Category segmentation for the month --------------------------------
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  let monthTotal = 0;
  for (const t of monthTxns ?? []) {
    const amount = Number(t.amount);
    if (!Number.isFinite(amount)) continue;
    const key =
      t.category_id && categoryById.has(t.category_id) ? t.category_id : "none";
    totals.set(key, (totals.get(key) ?? 0) + amount);
    monthTotal += amount;
  }

  const segments: Segment[] = [...totals.entries()]
    .map(([id, amount]) => ({
      id,
      label: id === "none" ? "לא מסווג" : (categoryById.get(id)?.name ?? "לא מסווג"),
      amount: Math.round(amount * 100) / 100,
      share: monthTotal > 0 ? amount / monthTotal : 0,
      category: id === "none" ? null : (categoryById.get(id) ?? null),
    }))
    .sort((a, b) => {
      // Uncategorized always sorts last, however large it is.
      if (a.id === "none") return 1;
      if (b.id === "none") return -1;
      return b.amount - a.amount;
    });

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
      segments={segments}
      monthTotal={Math.round(monthTotal * 100) / 100}
      incomes={incomes ?? []}
      members={members ?? []}
    />
  );
}
