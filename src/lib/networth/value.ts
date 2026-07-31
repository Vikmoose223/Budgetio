/**
 * Turning stored rows into one ILS number per account, plus the provenance of
 * that number. Nothing in the UI should ever show a value without also showing
 * how it was arrived at — see `basis`.
 */

import { toILS, type FxTable } from "./currency";
import { driftFromAnchor, type Flow, type MonthlyYield } from "./drift";
import { loanState } from "./amortization";
import { accountReturn } from "./xirr";

export type AssetKind =
  | "pension"
  | "gemel"
  | "hishtalmut"
  | "brokerage"
  | "crypto"
  | "real_estate"
  | "cash"
  | "other";

export type LiabilityKind =
  | "mortgage"
  | "personal_loan"
  | "car_loan"
  | "credit_line"
  | "other";

export type AccountRow = {
  id: string;
  name: string;
  kind: AssetKind;
  owner_profile_id: string | null;
  currency: string;
  fund_id: number | null;
  fund_source: "gemel" | "pension" | null;
};

export type HoldingRow = {
  symbol: string;
  quantity: number;
  market: "us" | "tase" | "crypto";
};

export type PriceRow = {
  symbol: string;
  market: string;
  price: number;
  currency: string;
  as_of: string;
};

export type ValuationRow = { as_of: string; value: number };

/** How an account's value was derived — drives the badge shown next to it. */
export type ValueBasis =
  | "holdings" // priced from live quotes: exact
  | "anchor" // a manually entered balance, used as-is
  | "drift" // manual balance carried forward by published fund returns
  | "computed" // amortization schedule: exact
  | "none"; // nothing to value it with

export type ValuedAccount = {
  id: string;
  name: string;
  kind: AssetKind;
  ownerProfileId: string | null;
  /** ILS. Null when the account can't be valued at all. */
  value: number | null;
  basis: ValueBasis;
  /** Date the value was last genuinely known. */
  asOf: string | null;
  estimated: boolean;
  /** Latest YYYYMM of published return applied, for drift accounts. */
  lastYieldPeriod: number | null;
  /** Symbols we hold but couldn't price — shown as a warning. */
  unpricedSymbols: string[];
  /** Annualised money-weighted return, or null when flows are unknown. */
  returnRate: number | null;
};

function priceKey(symbol: string, market: string): string {
  return `${market}:${symbol.toUpperCase()}`;
}

/** Index price rows by symbol+market, keeping the most recent per key. */
export function priceIndex(rows: PriceRow[]): Map<string, PriceRow> {
  const index = new Map<string, PriceRow>();
  for (const row of rows) {
    const key = priceKey(row.symbol, row.market);
    const existing = index.get(key);
    if (!existing || row.as_of > existing.as_of) index.set(key, row);
  }
  return index;
}

export type ValueAccountInput = {
  account: AccountRow;
  holdings: HoldingRow[];
  prices: Map<string, PriceRow>;
  valuations: ValuationRow[];
  flows: Flow[];
  yields: MonthlyYield[];
  fx: FxTable;
  asOf: string;
};

/**
 * Value a single asset account.
 *
 * Priority: live holdings (exact) → manual balance drifted by published fund
 * returns (estimate) → manual balance as-is → unvaluable.
 */
export function valueAccount(input: ValueAccountInput): ValuedAccount {
  const { account, holdings, prices, valuations, flows, yields, fx, asOf } =
    input;

  const base = {
    id: account.id,
    name: account.name,
    kind: account.kind,
    ownerProfileId: account.owner_profile_id,
  };

  // Latest anchor, if any.
  const latest = [...valuations].sort((a, b) => b.as_of.localeCompare(a.as_of))[0];

  // --- 1. Priced holdings -------------------------------------------------
  if (holdings.length > 0) {
    let total = 0;
    let priced = 0;
    let newestPrice: string | null = null;
    const unpriced: string[] = [];

    for (const h of holdings) {
      const row = prices.get(priceKey(h.symbol, h.market));
      if (!row) {
        unpriced.push(h.symbol);
        continue;
      }
      const ils = toILS(Number(row.price), row.currency, fx);
      if (ils === null) {
        unpriced.push(h.symbol);
        continue;
      }
      total += ils * Number(h.quantity);
      priced++;
      if (!newestPrice || row.as_of > newestPrice) newestPrice = row.as_of;
    }

    if (priced > 0) {
      const value = round2(total);
      return {
        ...base,
        value,
        basis: "holdings",
        asOf: newestPrice,
        estimated: false,
        lastYieldPeriod: null,
        unpricedSymbols: unpriced,
        returnRate: accountReturn(flows, value, asOf),
      };
    }
    // Nothing could be priced — fall through to the manual balance.
  }

  // --- 2. Manual anchor, optionally drifted -------------------------------
  if (latest) {
    const anchorILS = toILS(Number(latest.value), account.currency, fx);
    if (anchorILS === null) {
      return unvaluable(base, holdings.map((h) => h.symbol));
    }

    const canDrift = account.fund_id !== null && yields.length > 0;
    if (canDrift) {
      const drifted = driftFromAnchor(
        { value: anchorILS, as_of: latest.as_of },
        yields,
        flows,
        asOf,
      );
      return {
        ...base,
        value: drifted.value,
        basis: drifted.estimated ? "drift" : "anchor",
        asOf: latest.as_of,
        estimated: drifted.estimated,
        lastYieldPeriod: drifted.lastYieldPeriod,
        unpricedSymbols: [],
        returnRate: accountReturn(flows, drifted.value, asOf),
      };
    }

    return {
      ...base,
      value: round2(anchorILS),
      basis: "anchor",
      asOf: latest.as_of,
      estimated: false,
      lastYieldPeriod: null,
      unpricedSymbols: [],
      returnRate: accountReturn(flows, anchorILS, asOf),
    };
  }

  return unvaluable(base, holdings.map((h) => h.symbol));
}

function unvaluable(
  base: Pick<ValuedAccount, "id" | "name" | "kind" | "ownerProfileId">,
  unpricedSymbols: string[],
): ValuedAccount {
  return {
    ...base,
    value: null,
    basis: "none",
    asOf: null,
    estimated: false,
    lastYieldPeriod: null,
    unpricedSymbols,
    returnRate: null,
  };
}

// ---------------------------------------------------------------------------
// Liabilities
// ---------------------------------------------------------------------------

export type LiabilityRow = {
  id: string;
  name: string;
  kind: LiabilityKind;
  owner_profile_id: string | null;
  currency: string;
  principal: number;
  annual_rate: number;
  term_months: number;
  start_date: string;
  payment_amount: number | null;
  linkage: "none" | "cpi";
  balance_override: number | null;
  balance_override_as_of: string | null;
};

export type ValuedLiability = {
  id: string;
  name: string;
  kind: LiabilityKind;
  ownerProfileId: string | null;
  /** Outstanding balance in ILS, positive. */
  balance: number;
  basis: ValueBasis;
  asOf: string | null;
  monthlyPayment: number;
  monthsRemaining: number;
  interestPaid: number;
};

/**
 * Outstanding balance for a liability. A manually entered balance always wins
 * over the computed schedule — the bank's number is the real one.
 */
export function valueLiability(
  row: LiabilityRow,
  asOf: string,
  fx: FxTable,
  cpiRatio = 1,
): ValuedLiability {
  const state = loanState(
    {
      principal: Number(row.principal),
      annualRate: Number(row.annual_rate),
      termMonths: Number(row.term_months),
      startDate: row.start_date,
      paymentAmount: row.payment_amount,
      linkage: row.linkage,
    },
    asOf,
    cpiRatio,
  );

  const useOverride =
    row.balance_override !== null && row.balance_override !== undefined;
  const rawBalance = useOverride ? Number(row.balance_override) : state.balance;
  const balance = toILS(rawBalance, row.currency, fx) ?? rawBalance;
  const payment = toILS(state.payment, row.currency, fx) ?? state.payment;
  const interest = toILS(state.interestPaid, row.currency, fx) ?? state.interestPaid;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    ownerProfileId: row.owner_profile_id,
    balance: round2(balance),
    basis: useOverride ? "anchor" : "computed",
    asOf: useOverride ? row.balance_override_as_of : asOf,
    monthlyPayment: round2(payment),
    monthsRemaining: state.monthsRemaining,
    interestPaid: round2(interest),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
