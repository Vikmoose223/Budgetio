/**
 * Household-level roll-up: assets vs liabilities, allocation, and per-partner
 * attribution.
 */

import type { AssetKind, ValuedAccount, ValuedLiability } from "./value";

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  pension: "פנסיה",
  gemel: "קופת גמל",
  hishtalmut: "קרן השתלמות",
  brokerage: "תיק מסחר",
  crypto: "קריפטו",
  real_estate: "נדל״ן",
  cash: "מזומן ועו״ש",
  other: "אחר",
};

export const LIABILITY_KIND_LABELS: Record<string, string> = {
  mortgage: "משכנתא",
  personal_loan: "הלוואה אישית",
  car_loan: "הלוואת רכב",
  credit_line: "מסגרת אשראי",
  other: "אחר",
};

/**
 * Assets you could actually reach in a hurry. Pension and קרן השתלמות are
 * excluded (locked or penalised), as is property.
 */
const LIQUID_KINDS: AssetKind[] = ["cash", "brokerage", "crypto"];

export type KindSlice = {
  kind: AssetKind;
  label: string;
  value: number;
  /** Fraction of total assets, 0..1. */
  share: number;
};

export type OwnerSlice = {
  ownerProfileId: string | null;
  assets: number;
  liabilities: number;
  net: number;
};

export type NetWorthSummary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquidAssets: number;
  byKind: KindSlice[];
  byOwner: OwnerSlice[];
  /** True when any contributing value is a drift estimate. */
  hasEstimates: boolean;
  /** Accounts that exist but couldn't be valued at all. */
  unvaluableCount: number;
};

/** Roll up valued accounts and liabilities into the dashboard's headline numbers. */
export function summarizeNetWorth(
  accounts: ValuedAccount[],
  liabilities: ValuedLiability[],
): NetWorthSummary {
  let totalAssets = 0;
  let liquidAssets = 0;
  let hasEstimates = false;
  let unvaluableCount = 0;

  const kindTotals = new Map<AssetKind, number>();
  const ownerAssets = new Map<string | null, number>();

  for (const a of accounts) {
    if (a.value === null) {
      unvaluableCount++;
      continue;
    }
    if (a.estimated) hasEstimates = true;
    totalAssets += a.value;
    if (LIQUID_KINDS.includes(a.kind)) liquidAssets += a.value;
    kindTotals.set(a.kind, (kindTotals.get(a.kind) ?? 0) + a.value);
    ownerAssets.set(
      a.ownerProfileId,
      (ownerAssets.get(a.ownerProfileId) ?? 0) + a.value,
    );
  }

  let totalLiabilities = 0;
  const ownerLiabilities = new Map<string | null, number>();
  for (const l of liabilities) {
    totalLiabilities += l.balance;
    ownerLiabilities.set(
      l.ownerProfileId,
      (ownerLiabilities.get(l.ownerProfileId) ?? 0) + l.balance,
    );
  }

  const byKind: KindSlice[] = [...kindTotals.entries()]
    .map(([kind, value]) => ({
      kind,
      label: ASSET_KIND_LABELS[kind],
      value: round2(value),
      share: totalAssets > 0 ? value / totalAssets : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const owners = new Set<string | null>([
    ...ownerAssets.keys(),
    ...ownerLiabilities.keys(),
  ]);
  const byOwner: OwnerSlice[] = [...owners]
    .map((ownerProfileId) => {
      const assets = ownerAssets.get(ownerProfileId) ?? 0;
      const liabs = ownerLiabilities.get(ownerProfileId) ?? 0;
      return {
        ownerProfileId,
        assets: round2(assets),
        liabilities: round2(liabs),
        net: round2(assets - liabs),
      };
    })
    .sort((a, b) => b.net - a.net);

  return {
    totalAssets: round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    netWorth: round2(totalAssets - totalLiabilities),
    liquidAssets: round2(liquidAssets),
    byKind,
    byOwner,
    hasEstimates,
    unvaluableCount,
  };
}

/**
 * How many months of spending the liquid assets cover.
 *
 * Only possible because the app already holds real expense history — this is
 * the one number a standalone net-worth tracker can't produce.
 * Returns null when there's no spending baseline to divide by.
 */
export function monthsOfRunway(
  liquidAssets: number,
  avgMonthlyExpenses: number,
): number | null {
  if (!Number.isFinite(avgMonthlyExpenses) || avgMonthlyExpenses <= 0) {
    return null;
  }
  return Math.round((liquidAssets / avgMonthlyExpenses) * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
