import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import { formatILS, formatDate } from "@/lib/format";
import { detectRecurring } from "@/lib/recurring";
import { Repeat } from "lucide-react";

export default async function RecurringPage() {
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
      .select("id, name, icon, color")
      .eq("household_id", householdId),
    supabase
      .from("transactions")
      .select("merchant, amount, occurred_on, category_id")
      .eq("household_id", householdId)
      .limit(2000),
  ]);

  const catById = new Map((categories ?? []).map((c) => [c.id, c]));
  const items = detectRecurring(transactions ?? []);
  const monthlyEstimate = items.reduce((s, i) => s + i.typicalAmount, 0);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">הוצאות קבועות</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          בתי עסק שחוזרים על עצמם בכמה חודשים — כנראה מנויים והוראות קבע.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <Repeat className="size-6" />
          </div>
          <p className="font-medium">עדיין לא זוהו הוצאות קבועות</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            נזהה אותן אוטומטית ברגע שיהיו הוצאות מאותו בית עסק בכמה חודשים.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">הערכה חודשית קבועה</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">
              {formatILS(monthlyEstimate)}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const c = item.categoryId ? catById.get(item.categoryId) : undefined;
              return (
                <Card key={item.merchant}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={categoryTintStyle(c?.color ?? "muted-foreground")}
                    >
                      {categoryIconElement(c?.icon)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.merchant}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.months} חודשים · {c?.name ?? "ללא קטגוריה"} · אחרון:{" "}
                        {formatDate(item.lastDate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatILS(item.typicalAmount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">לחודש</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
