/**
 * Positions derived from a trade ledger: what you hold, what it cost, and how
 * far ahead or behind you are.
 *
 * Cost basis uses a **running weighted average**, not FIFO. For "how is this
 * doing?" the two agree on the total and differ only in how a partial sale is
 * attributed — and average is the one you can verify in your head. FIFO would
 * matter for tax lots, which this app doesn't try to be.
 *
 * Currency: a trade is recorded in the currency it was paid in, and cost basis
 * stays in that currency. Only the final figures are converted, at today's
 * rate. That means an old foreign purchase mixes price movement with currency
 * movement — unavoidable without historical FX, which no free source gives us,
 * and far better than converting the cost basis at a rate that didn't apply.
 */

import { toILS, type FxTable } from "./currency";

export type Trade = {
  symbol: string;
  market: "us" | "tase" | "crypto";
  side: "buy" | "sell";
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee: number;
  occurred_on: string;
  is_opening?: boolean;
};

export type Position = {
  symbol: string;
  market: "us" | "tase" | "crypto";
  /** Units currently held. */
  quantity: number;
  /** Average price paid per unit, in `currency`. */
  avgCost: number;
  /** quantity × avgCost, in `currency`. */
  costBasis: number;
  currency: string;
  /** Profit already banked by selling, in `currency`. */
  realizedPnl: number;
  totalFees: number;
  /** Whether any trade for this symbol was an opening estimate. */
  hasOpeningPosition: boolean;
};

/**
 * Replay the ledger into current positions.
 *
 * Trades are applied in date order so a sale is priced against the average
 * that existed at the time, not the final one.
 */
export function buildPositions(trades: Trade[]): Position[] {
  const sorted = [...trades].sort((a, b) =>
    a.occurred_on.localeCompare(b.occurred_on),
  );

  const bySymbol = new Map<string, Position>();

  for (const t of sorted) {
    const key = `${t.market}:${t.symbol}`;
    let p = bySymbol.get(key);
    if (!p) {
      p = {
        symbol: t.symbol,
        market: t.market,
        quantity: 0,
        avgCost: 0,
        costBasis: 0,
        currency: t.currency,
        realizedPnl: 0,
        totalFees: 0,
        hasOpeningPosition: false,
      };
      bySymbol.set(key, p);
    }

    const qty = Math.abs(Number(t.quantity)) || 0;
    const price = Number(t.price_per_unit) || 0;
    const fee = Number(t.fee) || 0;
    p.totalFees += fee;
    if (t.is_opening) p.hasOpeningPosition = true;

    if (t.side === "buy") {
      // New average = total spent / total units. Fees raise the basis, since
      // they're genuinely part of what the position cost.
      const newQuantity = p.quantity + qty;
      if (newQuantity > 0) {
        p.avgCost = (p.costBasis + qty * price + fee) / newQuantity;
      }
      p.quantity = newQuantity;
      p.costBasis = p.quantity * p.avgCost;
    } else {
      // Sell at most what's held; the average per unit is unchanged by a sale.
      const sold = Math.min(qty, p.quantity);
      p.realizedPnl += sold * (price - p.avgCost) - fee;
      p.quantity -= sold;
      p.costBasis = p.quantity * p.avgCost;
      if (p.quantity <= 0) {
        p.quantity = 0;
        p.costBasis = 0;
        // Average is meaningless with nothing held, but keep it for display of
        // a fully-closed position's history.
      }
    }
  }

  return [...bySymbol.values()]
    .map((p) => ({
      ...p,
      quantity: round8(p.quantity),
      avgCost: round4(p.avgCost),
      costBasis: round2(p.costBasis),
      realizedPnl: round2(p.realizedPnl),
      totalFees: round2(p.totalFees),
    }))
    .sort((a, b) => b.costBasis - a.costBasis);
}

export type ValuedPosition = Position & {
  /** Current market price per unit, in `priceCurrency`. Null if unpriced. */
  price: number | null;
  priceCurrency: string | null;
  /** Market value in ILS. Null if unpriced. */
  marketValue: number | null;
  /** Cost basis converted to ILS. */
  costBasisILS: number | null;
  /** marketValue − costBasisILS. Null if unpriced. */
  unrealizedPnl: number | null;
  /** Unrealized gain as a fraction of cost, e.g. 0.12 for +12%. */
  unrealizedPct: number | null;
};

export type PriceLookup = (
  symbol: string,
  market: string,
) => { price: number; currency: string } | null;

/** Attach current prices and compute profit and loss. */
export function valuePositions(
  positions: Position[],
  lookup: PriceLookup,
  fx: FxTable,
): ValuedPosition[] {
  return positions.map((p) => {
    const quote = lookup(p.symbol, p.market);
    const costBasisILS = toILS(p.costBasis, p.currency, fx);

    if (!quote) {
      return {
        ...p,
        price: null,
        priceCurrency: null,
        marketValue: null,
        costBasisILS: costBasisILS === null ? null : round2(costBasisILS),
        unrealizedPnl: null,
        unrealizedPct: null,
      };
    }

    const unitILS = toILS(quote.price, quote.currency, fx);
    const marketValue = unitILS === null ? null : unitILS * p.quantity;

    const unrealizedPnl =
      marketValue === null || costBasisILS === null
        ? null
        : marketValue - costBasisILS;

    return {
      ...p,
      price: quote.price,
      priceCurrency: quote.currency,
      marketValue: marketValue === null ? null : round2(marketValue),
      costBasisILS: costBasisILS === null ? null : round2(costBasisILS),
      unrealizedPnl: unrealizedPnl === null ? null : round2(unrealizedPnl),
      unrealizedPct:
        unrealizedPnl === null || !costBasisILS || costBasisILS === 0
          ? null
          : unrealizedPnl / costBasisILS,
    };
  });
}

/**
 * Trades as cash flows, for XIRR: a buy is money in, a sale is money out.
 * Converted to ILS so they sit alongside deposits into other accounts.
 */
export function tradesAsFlows(
  trades: Trade[],
  fx: FxTable,
): { occurred_on: string; amount: number }[] {
  const flows: { occurred_on: string; amount: number }[] = [];
  for (const t of trades) {
    const gross =
      (Math.abs(Number(t.quantity)) || 0) * (Number(t.price_per_unit) || 0);
    const fee = Number(t.fee) || 0;
    // A buy costs gross + fee; a sale returns gross − fee.
    const native = t.side === "buy" ? gross + fee : -(gross - fee);
    const ils = toILS(native, t.currency, fx);
    if (ils === null) continue;
    flows.push({ occurred_on: t.occurred_on, amount: round2(ils) });
  }
  return flows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
