/**
 * Income aggregation, and income measured against the same period's spending.
 *
 * Kept apart from `aggregate.ts` for the same reason the table is kept apart
 * from `transactions`: the expense totals there have been debugged twice and
 * shouldn't gain new branches.
 */

import { addMonths, monthLabel, budgetMonthOf } from "./format";

export type IncomeSource =
  | "salary"
  | "freelance"
  | "bonus"
  | "rent"
  | "investment"
  | "gift"
  | "refund"
  | "other";

export const INCOME_SOURCE_LABELS: Record<IncomeSource, string> = {
  salary: "משכורת",
  freelance: "עצמאי",
  bonus: "בונוס",
  rent: "שכר דירה",
  investment: "השקעות",
  gift: "מתנה",
  refund: "החזר",
  other: "אחר",
};

export type IncomeRow = {
  amount: number;
  occurred_on: string;
  source: IncomeSource;
  owner_profile_id?: string | null;
  recurring?: boolean;
};

export type IncomeSummary = {
  total: number;
  /** Portion flagged as a regular monthly income. */
  recurringTotal: number;
  bySource: { source: IncomeSource; label: string; amount: number }[];
  byOwner: { ownerProfileId: string | null; amount: number }[];
};

/** Total and breakdowns for a set of income rows (already scoped to a period). */
export function summarizeIncome(incomes: IncomeRow[]): IncomeSummary {
  let total = 0;
  let recurringTotal = 0;
  const bySource = new Map<IncomeSource, number>();
  const byOwner = new Map<string | null, number>();

  for (const i of incomes) {
    const amount = Number(i.amount);
    if (!Number.isFinite(amount)) continue;
    total += amount;
    if (i.recurring) recurringTotal += amount;
    bySource.set(i.source, (bySource.get(i.source) ?? 0) + amount);
    const owner = i.owner_profile_id ?? null;
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + amount);
  }

  return {
    total: round2(total),
    recurringTotal: round2(recurringTotal),
    bySource: [...bySource.entries()]
      .map(([source, amount]) => ({
        source,
        label: INCOME_SOURCE_LABELS[source],
        amount: round2(amount),
      }))
      .sort((a, b) => b.amount - a.amount),
    byOwner: [...byOwner.entries()]
      .map(([ownerProfileId, amount]) => ({ ownerProfileId, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export type CashFlow = {
  income: number;
  expenses: number;
  /** income − expenses. Negative means the month ran at a deficit. */
  net: number;
  /** Share of income that was spent, 0..1+. Null when there was no income. */
  spentShare: number | null;
  /** Share of income kept, e.g. 0.23 for 23%. Null when there was no income. */
  savingsRate: number | null;
};

/** Income against spending for one period. */
export function cashFlow(income: number, expenses: number): CashFlow {
  const net = income - expenses;
  const hasIncome = income > 0;
  return {
    income: round2(income),
    expenses: round2(expenses),
    net: round2(net),
    spentShare: hasIncome ? expenses / income : null,
    savingsRate: hasIncome ? net / income : null,
  };
}

export type IncomeTrendPoint = {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
};

/**
 * Income vs expenses for each of the `count` budget months ending at
 * `endMonthISO`. Mirrors `monthlyExpenseTrend` so the two charts line up.
 */
export function incomeVsExpenseTrend(
  endMonthISO: string,
  count: number,
  incomes: IncomeRow[],
  expenses: { amount: number; occurred_on: string }[],
  startDay = 1,
): IncomeTrendPoint[] {
  const points: IncomeTrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonthISO, -i);
    points.push({ month, label: monthLabel(month), income: 0, expenses: 0, net: 0 });
  }
  const indexByMonth = new Map(points.map((p, i) => [p.month, i]));

  for (const row of incomes) {
    const idx = indexByMonth.get(budgetMonthOf(row.occurred_on, startDay));
    if (idx !== undefined) points[idx].income += Number(row.amount);
  }
  for (const row of expenses) {
    const idx = indexByMonth.get(budgetMonthOf(row.occurred_on, startDay));
    if (idx !== undefined) points[idx].expenses += Number(row.amount);
  }
  for (const p of points) {
    p.income = round2(p.income);
    p.expenses = round2(p.expenses);
    p.net = round2(p.income - p.expenses);
  }
  return points;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
