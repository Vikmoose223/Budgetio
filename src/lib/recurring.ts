// Detect likely recurring expenses (subscriptions, standing orders) by finding
// merchants that appear across multiple distinct months.

export type RecurringTxn = {
  merchant: string | null;
  amount: number;
  occurred_on: string;
  category_id: string | null;
};

export type RecurringItem = {
  merchant: string;
  occurrences: number;
  months: number;
  typicalAmount: number; // median amount
  totalAmount: number;
  lastDate: string;
  categoryId: string | null;
};

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/**
 * Group by merchant and keep those seen in `minMonths`+ distinct months.
 * Sorted by number of months (then total spend) descending.
 */
export function detectRecurring(
  txns: RecurringTxn[],
  minMonths = 2,
): RecurringItem[] {
  const groups = new Map<string, RecurringTxn[]>();
  for (const t of txns) {
    const key = (t.merchant ?? "").trim();
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const items: RecurringItem[] = [];
  for (const [merchant, list] of groups) {
    const months = new Set(list.map((t) => t.occurred_on.slice(0, 7)));
    if (months.size < minMonths) continue;
    const amounts = list.map((t) => Number(t.amount));
    items.push({
      merchant,
      occurrences: list.length,
      months: months.size,
      typicalAmount: median(amounts),
      totalAmount: amounts.reduce((s, a) => s + a, 0),
      lastDate: list.reduce(
        (max, t) => (t.occurred_on > max ? t.occurred_on : max),
        list[0].occurred_on,
      ),
      categoryId: mostCommon(list.map((t) => t.category_id)),
    });
  }

  return items.sort((a, b) => b.months - a.months || b.totalAmount - a.totalAmount);
}
