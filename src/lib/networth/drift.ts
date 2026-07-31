/**
 * Carrying a manually-entered balance forward using published fund returns.
 *
 * Your actual pension balance lives behind a login at המסלקה הפנסיונית, so it
 * can't be fetched. What *is* public is each fund's monthly return, updated
 * daily on data.gov.il. So: you enter the balance once (the anchor), and we
 * compound the official monthly yields on top of it.
 *
 * The result is explicitly an estimate and the UI must label it as one.
 */

export type MonthlyYield = {
  /** YYYYMM. */
  report_period: number;
  /** Percent for that month, e.g. -0.46. */
  monthly_yield: number | null;
};

export type Flow = { occurred_on: string; amount: number };

export type Anchor = { value: number; as_of: string };

export type DriftResult = {
  value: number;
  /** True when any yield or flow was applied on top of the anchor. */
  estimated: boolean;
  /** Latest YYYYMM whose published return was applied, if any. */
  lastYieldPeriod: number | null;
  monthsApplied: number;
};

/** YYYYMM for an ISO date. */
export function periodOf(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return y * 100 + m;
}

/** The next YYYYMM after `period`. */
export function nextPeriod(period: number): number {
  const y = Math.floor(period / 100);
  const m = period % 100;
  return m === 12 ? (y + 1) * 100 + 1 : y * 100 + (m + 1);
}

/**
 * Compound `yields` onto `anchor`, adding deposits/withdrawals along the way.
 *
 * Within a month the yield is applied to the opening balance and flows are
 * added afterwards, so a deposit doesn't earn a full month of return it wasn't
 * invested for. Months with no published yield still accept their flows — the
 * balance simply doesn't grow that month.
 */
export function driftFromAnchor(
  anchor: Anchor,
  yields: MonthlyYield[],
  flows: Flow[],
  asOf: string,
): DriftResult {
  const anchorPeriod = periodOf(anchor.as_of);
  const endPeriod = periodOf(asOf);

  const yieldByPeriod = new Map<number, number>();
  for (const y of yields) {
    if (y.monthly_yield === null || y.monthly_yield === undefined) continue;
    yieldByPeriod.set(Number(y.report_period), Number(y.monthly_yield));
  }

  // Flows strictly after the anchor date; anything on or before it is already
  // reflected in the anchor balance itself.
  const flowByPeriod = new Map<number, number>();
  for (const f of flows) {
    if (f.occurred_on <= anchor.as_of) continue;
    const p = periodOf(f.occurred_on);
    flowByPeriod.set(p, (flowByPeriod.get(p) ?? 0) + Number(f.amount));
  }

  let value = Number(anchor.value);
  let lastYieldPeriod: number | null = null;
  let monthsApplied = 0;

  for (let p = nextPeriod(anchorPeriod); p <= endPeriod; p = nextPeriod(p)) {
    const y = yieldByPeriod.get(p);
    if (y !== undefined) {
      value *= 1 + y / 100;
      lastYieldPeriod = p;
      monthsApplied++;
    }
    const flow = flowByPeriod.get(p);
    if (flow !== undefined) value += flow;
  }

  return {
    value: Math.round(value * 100) / 100,
    estimated: monthsApplied > 0 || flowByPeriod.size > 0,
    lastYieldPeriod,
    monthsApplied,
  };
}
