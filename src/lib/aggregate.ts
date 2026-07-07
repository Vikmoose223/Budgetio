import { addMonths, monthLabel, budgetMonthOf } from "./format";

export type AggCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: "expense" | "saving";
};

export type AggTxn = {
  category_id: string | null;
  amount: number;
  occurred_on: string;
};

export type CategorySummary = {
  category: AggCategory;
  spent: number;
  goal: number;
};

export type MonthSummary = {
  perCategory: CategorySummary[];
  totalExpenseSpent: number;
  totalExpenseGoal: number;
  totalSavingSpent: number;
  totalSavingGoal: number;
};

/** Sum transaction amounts per category id. */
function spentByCategory(transactions: AggTxn[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of transactions) {
    if (!t.category_id) continue;
    m.set(t.category_id, (m.get(t.category_id) ?? 0) + Number(t.amount));
  }
  return m;
}

/**
 * Build a month summary: spending + goal per category (in the given category
 * order) and expense/saving totals. `goalByCategory` maps category id → target.
 */
export function summarizeMonth(
  categories: AggCategory[],
  transactions: AggTxn[],
  goalByCategory: Map<string, number>,
): MonthSummary {
  const spent = spentByCategory(transactions);

  const perCategory: CategorySummary[] = categories.map((category) => ({
    category,
    spent: spent.get(category.id) ?? 0,
    goal: goalByCategory.get(category.id) ?? 0,
  }));

  let totalExpenseSpent = 0,
    totalExpenseGoal = 0,
    totalSavingSpent = 0,
    totalSavingGoal = 0;
  for (const { category, spent: s, goal } of perCategory) {
    if (category.kind === "saving") {
      totalSavingSpent += s;
      totalSavingGoal += goal;
    } else {
      totalExpenseSpent += s;
      totalExpenseGoal += goal;
    }
  }

  return {
    perCategory,
    totalExpenseSpent,
    totalExpenseGoal,
    totalSavingSpent,
    totalSavingGoal,
  };
}

export type TrendPoint = { month: string; label: string; total: number };

/**
 * Total expense spending for each of the `count` months ending at `endMonthISO`
 * (inclusive). Savings-category transactions are excluded.
 */
export function monthlyExpenseTrend(
  endMonthISO: string,
  count: number,
  categories: AggCategory[],
  transactions: AggTxn[],
  startDay = 1,
): TrendPoint[] {
  const savingIds = new Set(
    categories.filter((c) => c.kind === "saving").map((c) => c.id),
  );

  const points: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonthISO, -i);
    points.push({ month, label: monthLabel(month), total: 0 });
  }
  const indexByMonth = new Map(points.map((p, i) => [p.month, i]));

  for (const t of transactions) {
    if (t.category_id && savingIds.has(t.category_id)) continue;
    const month = budgetMonthOf(t.occurred_on, startDay);
    const idx = indexByMonth.get(month);
    if (idx !== undefined) points[idx].total += Number(t.amount);
  }
  return points;
}
