import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ImportView } from "./import-view";

export default async function ImportPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;

  const [{ data: categories }, { data: rules }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, icon, color, kind")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("category_rules")
      .select("keyword, category_id")
      .eq("household_id", householdId),
  ]);

  if (!categories || categories.length === 0) redirect("/onboarding");

  return (
    <ImportView
      householdId={householdId}
      userId={user.id}
      categories={categories}
      rules={rules ?? []}
    />
  );
}
