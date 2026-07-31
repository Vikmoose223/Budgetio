/**
 * Net worth over time.
 *
 * Deliberately built only from *recorded* valuations and computed loan
 * balances — never by back-projecting today's share price onto past months,
 * which would invent a history that never happened. Accounts with no recorded
 * value at a given month simply don't contribute to that point, and the point
 * is marked partial so the UI can say so.
 *
 * The refresh route writes an automatic valuation snapshot each time it prices
 * a holdings account, so this history fills in and improves over time.
 */

import { toILS, type FxTable } from "./currency";
import { loanState } from "./amortization";
import type { LiabilityRow } from "./value";

export type TrendAccount = {
  id: string;
  currency: string;
  valuations: { as_of: string; value: number }[];
};

export type NetWorthTrendPoint = {
  /** Month key, YYYY-MM-01. */
  month: string;
  /** Last day of that month, the date values are taken as of. */
  asOf: string;
  assets: number;
  liabilities: number;
  net: number;
  /** True when at least one account had no recorded value by then. */
  partial: boolean;
};

/** Last calendar day of the month a YYYY-MM-01 key refers to. */
export function endOfMonth(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** The most recent valuation at or before `asOf`, or null. */
function valueAt(
  account: TrendAccount,
  asOf: string,
): { as_of: string; value: number } | null {
  let best: { as_of: string; value: number } | null = null;
  for (const v of account.valuations) {
    if (v.as_of > asOf) continue;
    if (!best || v.as_of > best.as_of) best = v;
  }
  return best;
}

export function netWorthTrend(
  months: string[],
  accounts: TrendAccount[],
  liabilities: LiabilityRow[],
  fx: FxTable,
  cpiRatioAt: (asOf: string, startDate: string) => number = () => 1,
): NetWorthTrendPoint[] {
  return months.map((month) => {
    const asOf = endOfMonth(month);

    let assets = 0;
    let partial = false;
    for (const account of accounts) {
      const v = valueAt(account, asOf);
      if (!v) {
        partial = true;
        continue;
      }
      const ils = toILS(v.value, account.currency, fx);
      if (ils === null) {
        partial = true;
        continue;
      }
      assets += ils;
    }

    let liabTotal = 0;
    for (const l of liabilities) {
      // A loan that hadn't started yet contributes nothing.
      if (l.start_date > asOf) continue;
      const state = loanState(
        {
          principal: Number(l.principal),
          annualRate: Number(l.annual_rate),
          termMonths: Number(l.term_months),
          startDate: l.start_date,
          paymentAmount: l.payment_amount,
          linkage: l.linkage,
        },
        asOf,
        cpiRatioAt(asOf, l.start_date),
      );
      const ils = toILS(state.balance, l.currency, fx);
      liabTotal += ils ?? state.balance;
    }

    return {
      month,
      asOf,
      assets: round2(assets),
      liabilities: round2(liabTotal),
      net: round2(assets - liabTotal),
      partial,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
