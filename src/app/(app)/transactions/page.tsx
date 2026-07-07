import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { periodRange, monthLabel } from "@/lib/format";
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
  const monthISO = /^\d{4}-\d{2}$/.test(sp.month ?? "")
    ? `${sp.month}-01`
    : null;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, icon, color, kind")
    .eq("household_id", householdId)
    .order("sort_order");
  if (!categories || categories.length === 0) redirect("/onboarding");

  let query = supabase
    .from("transactions")
    .select("id, category_id, occurred_on, amount, description, merchant, source")
    .eq("household_id", householdId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const filterCategory = sp.category
    ? categories.find((c) => c.id === sp.category)
    : undefined;
  if (filterCategory) query = query.eq("category_id", filterCategory.id);
  if (monthISO) {
    const { data: hh } = await supabase
      .from("households")
      .select("month_start_day")
      .eq("id", householdId)
      .single();
    const { start, endExclusive } = periodRange(monthISO, hh?.month_start_day ?? 1);
    query = query.gte("occurred_on", start).lt("occurred_on", endExclusive);
  }

  const { data: transactions } = await query;

  const filter =
    filterCategory || monthISO
      ? {
          label: [filterCategory?.name, monthISO ? monthLabel(monthISO) : null]
            .filter(Boolean)
            .join(" · "),
        }
      : null;

  return (
    <TransactionsView
      householdId={householdId}
      userId={user.id}
      categories={categories}
      initial={transactions ?? []}
      filter={filter}
    />
  );
}
