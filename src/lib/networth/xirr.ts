/**
 * Money-weighted return (XIRR) — the same definition Excel's XIRR uses.
 *
 * Simple "value now vs value then" would count a pension deposit as a gain, so
 * every real return in the app goes through here: the deposits and withdrawals
 * are cash flows, the current value is a final inflow, and we solve for the
 * annual rate that discounts them all to zero.
 */

export type CashFlow = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Negative = money in (a deposit), positive = money out (withdrawal/value). */
  amount: number;
};

const DAYS_PER_YEAR = 365;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-7;

/** Whole days between two ISO dates, parsed as UTC so DST never shifts the count. */
function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const from = Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1);
  const to = Date.UTC(ty, (tm ?? 1) - 1, td ?? 1);
  return (to - from) / 86_400_000;
}

/** Net present value of the flows at rate `r`, with times in years from t0. */
function npv(rate: number, times: number[], amounts: number[]): number {
  let total = 0;
  for (let i = 0; i < times.length; i++) {
    total += amounts[i] / Math.pow(1 + rate, times[i]);
  }
  return total;
}

/** d(NPV)/d(rate). */
function npvDerivative(
  rate: number,
  times: number[],
  amounts: number[],
): number {
  let total = 0;
  for (let i = 0; i < times.length; i++) {
    total -= (times[i] * amounts[i]) / Math.pow(1 + rate, times[i] + 1);
  }
  return total;
}

/**
 * Annualised money-weighted return, e.g. 0.082 for 8.2%.
 *
 * Returns `null` rather than a wrong number when the answer is undefined:
 * fewer than two flows, all flows the same sign (no return can be implied),
 * or no convergence. Callers show "תשואה לא זמינה" on null.
 */
export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const hasPositive = sorted.some((f) => f.amount > 0);
  const hasNegative = sorted.some((f) => f.amount < 0);
  // Without both directions the equation has no meaningful root.
  if (!hasPositive || !hasNegative) return null;

  const t0 = sorted[0].date;
  const times = sorted.map((f) => daysBetween(t0, f.date) / DAYS_PER_YEAR);
  const amounts = sorted.map((f) => f.amount);

  // Newton-Raphson: fast when it works.
  let rate = guess;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (rate <= -1) break; // (1+r)^t goes complex; hand over to bisection
    const value = npv(rate, times, amounts);
    if (Math.abs(value) < TOLERANCE) return rate;
    const derivative = npvDerivative(rate, times, amounts);
    if (!Number.isFinite(derivative) || derivative === 0) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < TOLERANCE) return next;
    rate = next;
  }

  return bisect(times, amounts);
}

/**
 * Fallback root-find on [-0.9999, 10]. Slower but can't diverge, which matters
 * for short holding periods where Newton overshoots past -100%.
 */
function bisect(times: number[], amounts: number[]): number | null {
  let low = -0.9999;
  let high = 10;
  let fLow = npv(low, times, amounts);
  let fHigh = npv(high, times, amounts);

  // Widen once in case the true rate is above 1000%.
  if (fLow * fHigh > 0) {
    high = 100;
    fHigh = npv(high, times, amounts);
    if (fLow * fHigh > 0) return null; // no sign change → no root in range
  }

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, times, amounts);
    if (Math.abs(fMid) < TOLERANCE || (high - low) / 2 < TOLERANCE) return mid;
    if (fLow * fMid < 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/**
 * Convenience wrapper for an account: deposits/withdrawals plus the current
 * value as a closing inflow.
 *
 * `flows` use the app's sign convention (positive = deposit into the account),
 * which is the opposite of the XIRR convention, so they're negated here.
 */
export function accountReturn(
  flows: { occurred_on: string; amount: number }[],
  currentValue: number,
  asOf: string,
): number | null {
  if (flows.length === 0) return null;
  const cashFlows: CashFlow[] = flows.map((f) => ({
    date: f.occurred_on,
    amount: -Number(f.amount),
  }));
  cashFlows.push({ date: asOf, amount: currentValue });
  return xirr(cashFlows);
}
