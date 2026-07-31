/**
 * Loan balances. Nothing is fetched here — given the original terms, the
 * outstanding balance on any date is exact arithmetic.
 *
 * The schedule is simulated month by month rather than closed-form so that a
 * custom payment, CPI linkage (צמוד מדד), grace periods and balloon structures
 * all fall out of one loop, and so the same loop can produce a payoff chart.
 */

/**
 * שפיצר  — level payment from day one.
 * גרייס  — `graceMonths` with no principal repayment, then שפיצר on the rest.
 * בלון   — no principal repayment at all; the whole thing is due at maturity.
 * ללא    — no schedule: a debt that simply sits there until it's settled
 *          (money owed to a parent, an interest-free IOU). The balance only
 *          moves when you say it does.
 */
export type LoanType = "spitzer" | "grace" | "balloon" | "none";

export type LoanTerms = {
  /** Original amount borrowed. */
  principal: number;
  /** Effective annual rate as a percent, e.g. 4.25. For prime-linked loans
   *  this is already prime + margin — see `effectiveRate`. */
  annualRate: number;
  termMonths: number;
  /** ISO date the loan started. */
  startDate: string;
  /** Overrides the computed level payment when the real one differs. */
  paymentAmount?: number | null;
  linkage?: "none" | "cpi";
  loanType?: LoanType;
  /** Months of grace. Ignored unless loanType is "grace". */
  graceMonths?: number;
  /**
   * true  = מלא: interest accrues into the principal, nothing is paid.
   * false = חלקי: interest is paid monthly, the principal is untouched.
   */
  capitalizeInterest?: boolean;
};

export type LoanState = {
  /** Outstanding balance on the requested date. */
  balance: number;
  /** What you actually pay per month *right now* — which during a grace
   *  period is the interest, or nothing at all if it's being capitalized. */
  payment: number;
  monthsElapsed: number;
  monthsRemaining: number;
  principalPaid: number;
  interestPaid: number;
  /** True while the loan is still inside its grace/balloon period. */
  inGrace: boolean;
  /** Lump sum falling due at maturity; null unless this is a balloon. */
  balloonDue: number | null;
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
 * The rate actually in force. Prime-linked loans track the Bank of Israel
 * prime rate plus a margin, which is often negative (פריים מינוס 0.5).
 */
export function effectiveRate(
  rateType: "fixed" | "prime",
  annualRate: number,
  primeRate: number,
  primeMargin: number,
): number {
  if (rateType !== "prime") return Number(annualRate) || 0;
  // A negative margin can't push the rate below zero.
  return Math.max(0, Number(primeRate) + Number(primeMargin));
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
  const loanType: LoanType = terms.loanType ?? "spitzer";
  const capitalize = terms.capitalizeInterest ?? false;
  const i = annualRate / 100 / 12;

  // A debt with no schedule: it doesn't amortize and it doesn't accrue.
  // It sits at its face value until it's settled or overridden.
  if (loanType === "none") {
    const linked = applyLinkage(principal, terms.linkage, cpiRatio);
    return {
      balance: round2(linked),
      payment: 0,
      monthsElapsed: monthsBetween(startDate, asOf),
      monthsRemaining: 0,
      principalPaid: 0,
      interestPaid: 0,
      inGrace: false,
      balloonDue: null,
    };
  }

  // How long principal repayment is deferred.
  const graceEnd =
    loanType === "balloon"
      ? termMonths
      : loanType === "grace"
        ? Math.min(Math.max(terms.graceMonths ?? 0, 0), termMonths)
        : 0;

  // Capitalized interest compounds the principal through the grace period, so
  // regular amortization starts from a larger balance over a shorter term.
  const balanceAtAmortStart = capitalize
    ? principal * Math.pow(1 + i, graceEnd)
    : principal;
  const amortMonths = termMonths - graceEnd;
  const scheduledPayment =
    terms.paymentAmount && terms.paymentAmount > 0
      ? Number(terms.paymentAmount)
      : levelPayment(balanceAtAmortStart, annualRate, amortMonths);

  const elapsed = Math.min(monthsBetween(startDate, asOf), termMonths);

  let balance = principal;
  let interestPaid = 0;
  let principalPaid = 0;

  for (let m = 0; m < elapsed; m++) {
    const interest = balance * i;

    if (m < graceEnd) {
      if (capitalize) {
        balance += interest; // accrues, nothing leaves your pocket
      } else {
        interestPaid += interest; // paid monthly, principal untouched
      }
      continue;
    }

    // The final payment is whatever clears the balance.
    const applied = Math.min(scheduledPayment, balance + interest);
    const towardPrincipal = applied - interest;
    interestPaid += interest;
    principalPaid += towardPrincipal;
    balance = balance + interest - applied;
    if (balance <= 0) {
      balance = 0;
      break;
    }
  }

  const inGrace = elapsed < graceEnd;
  const currentPayment = inGrace
    ? capitalize
      ? 0
      : balance * i
    : loanType === "balloon"
      ? capitalize
        ? 0
        : balance * i
      : scheduledPayment;

  return {
    balance: round2(applyLinkage(balance, terms.linkage, cpiRatio)),
    payment: round2(currentPayment),
    monthsElapsed: elapsed,
    monthsRemaining: Math.max(0, termMonths - elapsed),
    principalPaid: round2(principalPaid),
    interestPaid: round2(interestPaid),
    inGrace,
    // For a balloon, everything still outstanding falls due on the last day.
    balloonDue:
      loanType === "balloon"
        ? round2(applyLinkage(balanceAtAmortStart, terms.linkage, cpiRatio))
        : null,
  };
}

function applyLinkage(
  balance: number,
  linkage: "none" | "cpi" | undefined,
  cpiRatio: number,
): number {
  return linkage === "cpi" && Number.isFinite(cpiRatio) && cpiRatio > 0
    ? balance * cpiRatio
    : balance;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
