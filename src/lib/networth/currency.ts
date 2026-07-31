/**
 * Currency normalisation. Everything in the app is displayed in ILS, but the
 * sources report in several units, so conversion happens in exactly one place.
 */

/** Rate lookup: "USD" → shekels per unit. ILS itself is always 1. */
export type FxTable = Map<string, number>;

/**
 * Tel Aviv quotes come back from the price API denominated in **agorot**
 * (`ILA`), not shekels: TEVA.TA at 10870 means ₪108.70.
 *
 * Getting this wrong inflates a TASE position 100×, and because the number is
 * still "plausible looking" it would not obviously be a bug on screen. Hence
 * its own currency code and its own test.
 */
export const AGOROT_PER_SHEKEL = 100;

/**
 * Convert an amount in `currency` to ILS.
 *
 * Returns `null` when the rate is unknown rather than silently treating the
 * amount as shekels — a missing FX rate must show as "לא זמין", not as a
 * wrong contribution to net worth.
 */
export function toILS(
  amount: number,
  currency: string,
  fx: FxTable,
): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;

  const code = currency.toUpperCase();
  if (code === "ILS") return value;
  if (code === "ILA") return value / AGOROT_PER_SHEKEL;

  const rate = fx.get(code);
  if (rate === undefined || !Number.isFinite(rate)) return null;
  return value * rate;
}

/** Build an FX table from cached rows quoting `rate` shekels per unit of `base`. */
export function fxTableFrom(
  rows: { base: string; quote: string; rate: number }[],
): FxTable {
  const table: FxTable = new Map([["ILS", 1]]);
  for (const row of rows) {
    if (row.quote.toUpperCase() !== "ILS") continue;
    table.set(row.base.toUpperCase(), Number(row.rate));
  }
  return table;
}
