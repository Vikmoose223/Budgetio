/**
 * מדד המחירים לצרכן from the Central Bureau of Statistics — needed to value
 * צמוד-מדד loans. Keyless JSON; series 120010 is the headline index.
 */

const CBS_BASE = "https://api.cbs.gov.il/index/data/price";

/** מדד המחירים לצרכן - כללי */
export const CPI_SERIES_ID = 120010;

export type CpiRow = {
  /** YYYYMM. */
  period: number;
  value: number;
};

export function cpiUrl(last = 120): string {
  return `${CBS_BASE}?id=${CPI_SERIES_ID}&format=json&download=false&last=${last}`;
}

/**
 * Map a CBS payload to index rows.
 *
 * The response nests month → date[], each entry carrying the index level in
 * `currBase.value`. Rebasing (e.g. "2024 ממוצע") means levels are only
 * comparable within a base, which is fine here: we always use ratios between
 * two dates and the API returns a single current base.
 */
export function parseCpi(payload: unknown): CpiRow[] {
  const months = (payload as { month?: unknown[] })?.month;
  if (!Array.isArray(months)) return [];

  const rows: CpiRow[] = [];
  for (const series of months) {
    const dates = (series as { date?: unknown[] })?.date;
    if (!Array.isArray(dates)) continue;
    for (const entry of dates) {
      const e = entry as {
        year?: unknown;
        month?: unknown;
        currBase?: { value?: unknown };
      };
      const year = Number(e.year);
      const month = Number(e.month);
      const value = Number(e.currBase?.value);
      if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
      if (!Number.isFinite(value)) continue;
      rows.push({ period: year * 100 + month, value });
    }
  }
  return rows;
}

/**
 * Index ratio between two dates — what a צמוד-מדד balance gets multiplied by.
 * Falls back to 1 (no linkage effect) when either endpoint is unknown, so a
 * missing data point can never silently inflate or deflate a loan.
 */
export function cpiRatio(
  rows: CpiRow[],
  fromPeriod: number,
  toPeriod: number,
): number {
  const byPeriod = new Map(rows.map((r) => [r.period, r.value]));

  const at = (target: number): number | null => {
    const exact = byPeriod.get(target);
    if (exact !== undefined) return exact;
    // Fall back to the most recent published month at or before the target.
    let best: { period: number; value: number } | null = null;
    for (const r of rows) {
      if (r.period > target) continue;
      if (!best || r.period > best.period) best = r;
    }
    return best?.value ?? null;
  };

  const from = at(fromPeriod);
  const to = at(toPeriod);
  if (from === null || to === null || from <= 0) return 1;
  return to / from;
}

/** Fetch recent CPI history. Empty on failure. */
export async function fetchCpi(last = 120): Promise<CpiRow[]> {
  try {
    const res = await fetch(cpiUrl(last), { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return [];
    return parseCpi(await res.json());
  } catch {
    return [];
  }
}
