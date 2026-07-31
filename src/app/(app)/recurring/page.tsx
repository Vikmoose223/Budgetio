import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import {
  formatILS,
  formatDate,
  todayISO,
  budgetMonthOf,
  periodRange,
  monthLabel,
} from "@/lib/format";
import { detectRecurring } from "@/lib/recurring";
import { groupFixedByCategory } from "@/lib/fixed";
import { MonthNav } from "@/components/month-nav";
import { Repeat, Pin } from "lucide-react";

export default async function RecurringPage({
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

  const sp = await searchParams;

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

  const startDay = household?.month_start_day ?? 1;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "")
    ? `${sp.month}-01`
    : budgetMonthOf(todayISO(), startDay);
  const { start, endExclusive } = periodRange(month, startDay);

  const [{ data: allTxns }, { data: fixedTxns }] = await Promise.all([
    // Detection needs history across months, not just this one.
    supabase
      .from("transactions")
      .select("merchant, amount, occurred_on, category_id")
      .eq("household_id", householdId)
      .limit(2000),
    // The manual flags are shown for the selected budget month.
    supabase
      .from("transactions")
      .select("id, category_id, amount, occurred_on, description, merchant, is_fixed")
      .eq("household_id", householdId)
      .eq("is_fixed", true)
      .gte("occurred_on", start)
      .lt("occurred_on", endExclusive)
      .order("occurred_on", { ascending: false }),
  ]);

  const cats = categories ?? [];
  const catById = new Map(cats.map((c) => [c.id, c]));
  const detected = detectRecurring(allTxns ?? []);
  const detectedEstimate = detected.reduce((s, i) => s + i.typicalAmount, 0);
  const fixed = groupFixedByCategory(fixedTxns ?? [], cats);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">הוצאות קבועות</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          מה שסימנתם ידנית, ומה שזוהה אוטומטית מהיסטוריית בתי העסק.
        </p>
      </header>

      {/* ---------------- Manually flagged, grouped by category ------------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Pin className="size-4 text-primary" />
            סומנו ידנית
          </h2>
          <MonthNav month={month} basePath="/recurring" />
        </div>

        {fixed.count === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center">
            <p className="font-medium">אין הוצאות שסומנו כקבועות ב{monthLabel(month)}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              סמנו הוצאה כ״קבועה״ במסך ההוצאות והיא תופיע כאן, מקובצת לפי קטגוריה.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">
                סה״כ קבועות ב{monthLabel(month)}
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">
                {formatILS(fixed.total)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fixed.count} הוצאות ב-{fixed.groups.length} קטגוריות
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {fixed.groups.map((group) => {
                const c = group.category;
                const share = fixed.total > 0 ? group.total / fixed.total : 0;
                return (
                  <Card key={c?.id ?? "none"}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                          style={categoryTintStyle(c?.color ?? undefined)}
                        >
                          {categoryIconElement(c?.icon ?? undefined)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {c?.name ?? "ללא קטגוריה"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.count} הוצאות · {Math.round(share * 100)}% מהקבועות
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatILS(group.total)}
                        </span>
                      </div>

                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                        {group.items.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="min-w-0 truncate text-muted-foreground">
                              {t.description || t.merchant || "הוצאה"} ·{" "}
                              {formatDate(t.occurred_on)}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatILS(Number(t.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ---------------- Automatically detected ---------------------------- */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Repeat className="size-4 text-primary" />
          זוהו אוטומטית
        </h2>

        {detected.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center">
            <p className="font-medium">עדיין לא זוהו הוצאות קבועות</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              נזהה אותן אוטומטית ברגע שיהיו הוצאות מאותו בית עסק בכמה חודשים.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">הערכה חודשית קבועה</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">
                {formatILS(detectedEstimate)}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {detected.map((item) => {
                const c = item.categoryId ? catById.get(item.categoryId) : undefined;
                return (
                  <Card key={item.merchant}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={categoryTintStyle(c?.color ?? "muted-foreground")}
                      >
                        {categoryIconElement(c?.icon ?? undefined)}
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
      </section>
    </div>
  );
}
