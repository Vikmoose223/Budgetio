/**
 * Standing deposit rules expanded into individual cash flows.
 *
 * Pension and קרן השתלמות contributions are monthly and near-identical, so
 * typing thirty rows to get a meaningful XIRR is friction that stops people
 * entering anything at all. The rule is stored and expanded on read, which
 * also means correcting the amount fixes every month at once instead of
 * requiring thirty edits.
 */

export type RecurringFlowRule = {
  amount: number;
  /** 1-28, so it exists in every month. */
  day_of_month: number;
  /** First day of the first month it applies to (YYYY-MM-01). */
  start_month: string;
  /** First day of the last month, or null while it's still running. */
  end_month: string | null;
};

export type Flow = { occurred_on: string; amount: number };

/** Hard stop so a bad date can't spin out an unbounded list. */
const MAX_MONTHS = 600; // 50 years

/**
 * Expand a rule into one flow per month, from `start_month` up to whichever
 * comes first: `end_month` or `asOf`. Never produces a flow in the future.
 */
export function expandRecurringFlow(
  rule: RecurringFlowRule,
  asOf: string,
): Flow[] {
  const amount = Number(rule.amount);
  if (!Number.isFinite(amount) || amount === 0) return [];

  const day = Math.min(Math.max(Number(rule.day_of_month) || 1, 1), 28);
  const [startYear, startMonth] = rule.start_month.split("-").map(Number);
  if (!startYear || !startMonth) return [];

  // The window closes at the rule's end or today, whichever is earlier.
  const limit =
    rule.end_month && rule.end_month < asOf ? rule.end_month : asOf;
  const [limitYear, limitMonth] = limit.split("-").map(Number);

  const flows: Flow[] = [];
  let year = startYear;
  let month = startMonth;

  for (let i = 0; i < MAX_MONTHS; i++) {
    if (year > limitYear || (year === limitYear && month > limitMonth)) break;

    const occurred = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // A deposit dated later this month hasn't happened yet.
    if (occurred > asOf) break;
    flows.push({ occurred_on: occurred, amount });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return flows;
}

/**
 * All cash flows for an account: one-off entries plus every expansion of its
 * standing rules, oldest first.
 */
export function allFlows(
  oneOff: Flow[],
  rules: RecurringFlowRule[],
  asOf: string,
): Flow[] {
  const expanded = rules.flatMap((r) => expandRecurringFlow(r, asOf));
  return [...oneOff, ...expanded].sort((a, b) =>
    a.occurred_on.localeCompare(b.occurred_on),
  );
}

/** Total deposited (positive) minus withdrawn (negative). */
export function netContributed(flows: Flow[]): number {
  const total = flows.reduce((sum, f) => sum + Number(f.amount), 0);
  return Math.round(total * 100) / 100;
}
