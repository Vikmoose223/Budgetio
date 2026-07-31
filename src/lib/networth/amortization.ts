/**
 * Loan balances. Nothing is fetched here — given the original terms, the
 * outstanding balance on any date is exact arithmetic.
 *
 * The schedule is simulated month by month rather than closed-form so that a
 * custom payment amount and CPI linkage (צמוד מדד) both fall out naturally,
 * and so the same loop can produce a payoff chart.
 */

export type LoanTerms = {
  /** Original amount borrowed. */
  principal: number;
  /** Nominal annual rate as a percent, e.g. 4.25. */
  annualRate: number;
  termMonths: number;
  /** ISO date the loan started. */
  startDate: string;
  /** Overrides the computed level payment when the real one differs. */
  paymentAmount?: number | null;
  linkage?: "none" | "cpi";
};

export type LoanState = {
  /** Outstanding balance on the requested date. */
  balance: number;
  /** The level monthly payment used (computed, or the override). */
  payment: number;
  monthsElapsed: number;
  monthsRemaining: number;
  principalPaid: number;
  interestPaid: number;
};

/** Whole months from `fromISO` to `toISO`, not counting a partial final month. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

/**
 * The standard level payment (תשלום שפיצר) for these terms.
 * Falls back to straight-line when the rate is zero.
 */
export function levelPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return 0;
  const i = annualRate / 100 / 12;
  if (i === 0) return principal / termMonths;
  return (principal * i) / (1 - Math.pow(1 + i, -termMonths));
}

/**
 * Outstanding balance and payment progress as of `asOf`.
 *
 * `cpiRatio` is the consumer price index on `asOf` divided by the index at the
 * loan's start. It's applied only when `linkage === "cpi"`, and only to the
 * remaining balance — the standard approximation for a צמוד-מדד loan. (A real
 * Israeli bank re-indexes the balance and recomputes the payment every month;
 * this tracks it closely enough for a net-worth figure, and the exact balance
 * can always be entered as an override.)
 */
export function loanState(
  terms: LoanTerms,
  asOf: string,
  cpiRatio = 1,
): LoanState {
  const { principal, annualRate, termMonths, startDate } = terms;
  const payment =
    terms.paymentAmount && terms.paymentAmount > 0
      ? Number(terms.paymentAmount)
      : levelPayment(principal, annualRate, termMonths);

  const i = annualRate / 100 / 12;
  const elapsed = Math.min(monthsBetween(startDate, asOf), termMonths);

  let balance = principal;
  let interestPaid = 0;
  let principalPaid = 0;

  for (let m = 0; m < elapsed; m++) {
    const interest = balance * i;
    // The final payment is whatever clears the balance.
    const applied = Math.min(payment, balance + interest);
    const towardPrincipal = applied - interest;
    interestPaid += interest;
    principalPaid += towardPrincipal;
    balance = balance + interest - applied;
    if (balance <= 0) {
      balance = 0;
      break;
    }
  }

  const linked =
    terms.linkage === "cpi" && Number.isFinite(cpiRatio) && cpiRatio > 0
      ? balance * cpiRatio
      : balance;

  return {
    balance: round2(linked),
    payment: round2(payment),
    monthsElapsed: elapsed,
    monthsRemaining: Math.max(0, termMonths - elapsed),
    principalPaid: round2(principalPaid),
    interestPaid: round2(interestPaid),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
