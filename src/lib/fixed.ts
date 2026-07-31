/**
 * Manually-flagged fixed expenses, grouped by category.
 *
 * This is the explicit counterpart to `recurring.ts`, which *infers* repeats
 * from merchant history. Inference misses anything whose merchant name varies
 * or that has only been paid once so far, so the flag is the override — and
 * because it's per transaction, the same merchant can be fixed one month and
 * not the next.
 */

import type { AggCategory } from "./aggregate";

export type FixedTxn = {
  id: string;
  category_id: string | null;
  amount: number;
  occurred_on: string;
  description: string | null;
  merchant: string | null;
  is_fixed?: boolean;
};

export type FixedCategoryGroup = {
  category: AggCategory | null;
  /** Sum for this category. */
  total: number;
  count: number;
  items: FixedTxn[];
};

export type FixedSummary = {
  groups: FixedCategoryGroup[];
  total: number;
  count: number;
};

/**
 * Group the flagged transactions by category, largest total first.
 * Uncategorized ones collect under a `null` category and always sort last, so
 * the meaningful groups stay at the top.
 */
export function groupFixedByCategory(
  transactions: FixedTxn[],
  categories: AggCategory[],
): FixedSummary {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const buckets = new Map<string, FixedTxn[]>();

  let total = 0;
  let count = 0;

  for (const t of transactions) {
    if (t.is_fixed === false) continue;
    const amount = Number(t.amount);
    if (!Number.isFinite(amount)) continue;

    // A category that has since been deleted falls in with the uncategorized.
    const key =
      t.category_id && categoryById.has(t.category_id) ? t.category_id : "__none__";
    const list = buckets.get(key);
    if (list) list.push(t);
    else buckets.set(key, [t]);

    total += amount;
    count++;
  }

  const groups: FixedCategoryGroup[] = [...buckets.entries()]
    .map(([key, items]) => ({
      category: key === "__none__" ? null : (categoryById.get(key) ?? null),
      total: round2(items.reduce((sum, t) => sum + Number(t.amount), 0)),
      count: items.length,
      items: [...items].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
    }))
    .sort((a, b) => {
      if (!a.category) return 1;
      if (!b.category) return -1;
      return b.total - a.total;
    });

  return { groups, total: round2(total), count };
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
