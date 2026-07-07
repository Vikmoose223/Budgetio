const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ILS_PRECISE = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as ILS, e.g. 1234 → "₪1,234". */
export function formatILS(amount: number, opts?: { precise?: boolean }): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return (opts?.precise ? ILS_PRECISE : ILS).format(n);
}

/**
 * First day of the given date's month as an ISO date string (YYYY-MM-01),
 * computed in local time. Used as the `month` key for budget_goals.
 */
export function firstOfMonthISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Human month label in Hebrew, e.g. "יולי 2026". */
export function monthLabel(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
  }).format(d);
}
