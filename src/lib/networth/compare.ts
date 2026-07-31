/**
 * Period-over-period comparison, built from recorded snapshots only.
 *
 * There is no source that can tell us what a pension was worth on a past date,
 * and historical share prices aren't available on the free tier — so this
 * never back-fills. If a date has no snapshot, the comparison says so instead
 * of inventing a baseline, and the UI reports how long until one exists.
 */

export type Snapshot = {
  as_of: string;
  value: number;
};

export type AccountSnapshot = Snapshot & { account_id: string };

export type Delta = {
  /** Value now. */
  current: number;
  /** Value at the baseline date, or null if nothing was recorded by then. */
  previous: number | null;
  /** current − previous, or null without a baseline. */
  change: number | null;
  /** Fractional change, e.g. 0.043 for +4.3%. Null if previous is 0 or absent. */
  changePct: number | null;
  /** The snapshot date actually used — rarely exactly the requested one. */
  baselineDate: string | null;
};

/** The latest snapshot at or before `date`. */
export function snapshotAt(
  snapshots: Snapshot[],
  date: string,
): Snapshot | null {
  let best: Snapshot | null = null;
  for (const s of snapshots) {
    if (s.as_of > date) continue;
    if (!best || s.as_of > best.as_of) best = s;
  }
  return best;
}

/**
 * Compare a current value against the snapshot on or before `baselineDate`.
 *
 * The baseline is the nearest recorded point at or before the requested date,
 * never after — using a later snapshot would quietly shrink the period being
 * compared and flatter the result.
 */
export function compareTo(
  current: number,
  snapshots: Snapshot[],
  baselineDate: string,
): Delta {
  const baseline = snapshotAt(snapshots, baselineDate);
  if (!baseline) {
    return {
      current: round2(current),
      previous: null,
      change: null,
      changePct: null,
      baselineDate: null,
    };
  }

  const previous = Number(baseline.value);
  const change = current - previous;
  return {
    current: round2(current),
    previous: round2(previous),
    change: round2(change),
    changePct: previous !== 0 ? change / Math.abs(previous) : null,
    baselineDate: baseline.as_of,
  };
}

export type AccountDelta = Delta & { accountId: string };

/** Per-account comparison, biggest mover first. */
export function compareAccounts(
  current: { id: string; value: number | null }[],
  snapshots: AccountSnapshot[],
  baselineDate: string,
): AccountDelta[] {
  const byAccount = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const list = byAccount.get(s.account_id);
    if (list) list.push(s);
    else byAccount.set(s.account_id, [s]);
  }

  return current
    .filter((a): a is { id: string; value: number } => a.value !== null)
    .map((a) => ({
      accountId: a.id,
      ...compareTo(a.value, byAccount.get(a.id) ?? [], baselineDate),
    }))
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
}

/** The ISO date `months` before `fromISO`, clamped to a valid day. */
export function monthsAgo(fromISO: string, months: number): string {
  const [y, m, d] = fromISO.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  // Clamp the day so 31 March minus one month doesn't overflow into March.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * How many more days until a baseline exists for the requested lookback.
 * Null once one does. Lets the UI say "עוד 12 ימים" rather than showing an
 * empty comparison with no explanation.
 */
export function daysUntilComparable(
  snapshots: Snapshot[],
  today: string,
  lookbackMonths: number,
): number | null {
  const baselineDate = monthsAgo(today, lookbackMonths);
  if (snapshotAt(snapshots, baselineDate)) return null;

  let earliest: string | null = null;
  for (const s of snapshots) {
    if (!earliest || s.as_of < earliest) earliest = s.as_of;
  }
  if (!earliest) return null; // nothing recorded at all yet

  // The first snapshot becomes usable once it's `lookbackMonths` old.
  const usableFrom = monthsAgo(earliest, -lookbackMonths);
  const days = Math.ceil(
    (Date.parse(`${usableFrom}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  return days > 0 ? days : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
