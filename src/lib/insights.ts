import type { MonthSummary } from "./aggregate";
import { formatILS } from "./format";

export type InsightTone = "warning" | "success" | "info";
export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  text: string;
};

/**
 * Derive human-readable insights from a month summary using simple rules.
 * Ordered by actionability (warnings first) and capped for a tidy UI.
 */
export function generateInsights({
  summary,
  prevExpenseTotal,
}: {
  summary: MonthSummary;
  prevExpenseTotal: number | null;
}): Insight[] {
  const insights: Insight[] = [];
  const expenseCats = summary.perCategory.filter(
    (c) => c.category.kind === "expense",
  );

  // 1. Over-budget categories (worst overage first).
  const over = expenseCats
    .filter((c) => c.goal > 0 && c.spent > c.goal)
    .map((c) => ({
      c,
      overBy: c.spent - c.goal,
      pct: Math.round(((c.spent - c.goal) / c.goal) * 100),
    }))
    .sort((a, b) => b.overBy - a.overBy);

  for (const { c, overBy, pct } of over.slice(0, 2)) {
    insights.push({
      id: `over-${c.category.name}`,
      tone: "warning",
      title: `חריגה ב${c.category.name}`,
      text: `הוצאתם ${formatILS(c.spent)} — ${formatILS(overBy)} מעל היעד (${pct}%).`,
    });
  }

  // 2. Approaching a limit (80–100% of goal).
  const near = expenseCats
    .filter((c) => c.goal > 0 && c.spent <= c.goal && c.spent >= c.goal * 0.8)
    .sort((a, b) => b.spent / b.goal - a.spent / a.goal);
  if (near.length > 0) {
    const c = near[0];
    insights.push({
      id: `near-${c.category.name}`,
      tone: "info",
      title: `מתקרבים ליעד ב${c.category.name}`,
      text: `ניצלתם ${Math.round((c.spent / c.goal) * 100)}% מהתקציב (${formatILS(c.spent)} מתוך ${formatILS(c.goal)}).`,
    });
  }

  // 3. Total spending vs last month.
  if (prevExpenseTotal !== null && prevExpenseTotal > 0) {
    const diff = summary.totalExpenseSpent - prevExpenseTotal;
    const pct = Math.round((Math.abs(diff) / prevExpenseTotal) * 100);
    if (pct >= 5) {
      insights.push(
        diff < 0
          ? {
              id: "trend-down",
              tone: "success",
              title: "פחות מהחודש שעבר",
              text: `הוצאתם ${pct}% פחות מהחודש הקודם. כל הכבוד!`,
            }
          : {
              id: "trend-up",
              tone: "info",
              title: "יותר מהחודש שעבר",
              text: `הוצאתם ${pct}% יותר מהחודש הקודם.`,
            },
      );
    }
  }

  // 4. Savings progress.
  if (summary.totalSavingGoal > 0) {
    if (summary.totalSavingSpent >= summary.totalSavingGoal) {
      insights.push({
        id: "save-goal",
        tone: "success",
        title: "יעד החיסכון הושג",
        text: `חסכתם ${formatILS(summary.totalSavingSpent)} החודש. מצוין!`,
      });
    } else if (summary.totalSavingSpent > 0) {
      insights.push({
        id: "save-progress",
        tone: "info",
        title: "בדרך ליעד החיסכון",
        text: `חסכתם ${formatILS(summary.totalSavingSpent)} מתוך ${formatILS(summary.totalSavingGoal)}.`,
      });
    }
  }

  // 5. Comfortably under the overall budget (only when nothing is over).
  if (
    over.length === 0 &&
    summary.totalExpenseGoal > 0 &&
    summary.totalExpenseSpent < summary.totalExpenseGoal
  ) {
    insights.push({
      id: "under-budget",
      tone: "success",
      title: "בתוך התקציב",
      text: `נשארו ${formatILS(summary.totalExpenseGoal - summary.totalExpenseSpent)} עד סוף החודש.`,
    });
  }

  // 6. Biggest category this month.
  const biggest = expenseCats
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)[0];
  if (biggest) {
    insights.push({
      id: "biggest",
      tone: "info",
      title: "הקטגוריה הגדולה החודש",
      text: `${biggest.category.name} — ${formatILS(biggest.spent)}.`,
    });
  }

  return insights.slice(0, 4);
}
