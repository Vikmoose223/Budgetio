import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { TransactionsView } from "./transactions-view";

export default async function TransactionsPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;

  const [{ data: categories }, { data: transactions }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, icon, color, kind")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("transactions")
      .select("id, category_id, occurred_on, amount, description, merchant, source")
      .eq("household_id", householdId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (!categories || categories.length === 0) redirect("/onboarding");

  return (
    <TransactionsView
      householdId={householdId}
      userId={user.id}
      categories={categories}
      initial={transactions ?? []}
    />
  );
}
