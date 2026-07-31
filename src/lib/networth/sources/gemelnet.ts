/**
 * Official fund returns from data.gov.il (רשות שוק ההון).
 *
 * Two datasets, same column layout:
 *   gemelnet   — קופות גמל / קרנות השתלמות
 *   pensia-net — קרנות פנסיה
 *
 * Updated daily; the newest REPORT_PERIOD trails the calendar by about a
 * month, which is why fund values in the app are labelled as estimates.
 */

const CKAN_BASE = "https://data.gov.il/api/3/action/datastore_search";

/** Resource ids for the "2024-היום" slice of each dataset. */
export const FUND_RESOURCES = {
  gemel: "a30dcbea-a1d2-482c-ae29-8f781f5025fb",
  pension: "6d47d6b5-cb08-488b-b333-f1e717b1e1bd",
} as const;

export type FundSource = keyof typeof FUND_RESOURCES;

export type FundYieldRow = {
  fund_id: number;
  source: FundSource;
  report_period: number;
  fund_name: string | null;
  managing_corp: string | null;
  monthly_yield: number | null;
  ytd_yield: number | null;
  avg_mgmt_fee: number | null;
  sharpe_ratio: number | null;
};

/** Coerce a CKAN numeric field, which arrives as number | string | null. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Map a CKAN datastore_search payload into rows for `fund_yields_cache`.
 * Records missing a fund id or period are dropped rather than stored broken.
 */
export function parseFundYields(payload: unknown, source: FundSource): FundYieldRow[] {
  const records = (payload as { result?: { records?: unknown[] } })?.result?.records;
  if (!Array.isArray(records)) return [];

  const rows: FundYieldRow[] = [];
  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    const fundId = num(r.FUND_ID);
    const period = num(r.REPORT_PERIOD);
    if (fundId === null || period === null) continue;

    rows.push({
      fund_id: fundId,
      source,
      report_period: period,
      fund_name: str(r.FUND_NAME),
      managing_corp: str(r.MANAGING_CORPORATION),
      monthly_yield: num(r.MONTHLY_YIELD),
      ytd_yield: num(r.YEAR_TO_DATE_YIELD),
      avg_mgmt_fee: num(r.AVG_ANNUAL_MANAGEMENT_FEE),
      sharpe_ratio: num(r.SHARPE_RATIO),
    });
  }
  return rows;
}

/** Distinct funds in a payload, for the fund picker in the account form. */
export type FundOption = {
  fund_id: number;
  fund_name: string;
  managing_corp: string | null;
  source: FundSource;
};

export function parseFundOptions(payload: unknown, source: FundSource): FundOption[] {
  const byId = new Map<number, FundOption>();
  for (const row of parseFundYields(payload, source)) {
    if (!row.fund_name || byId.has(row.fund_id)) continue;
    byId.set(row.fund_id, {
      fund_id: row.fund_id,
      fund_name: row.fund_name,
      managing_corp: row.managing_corp,
      source,
    });
  }
  return [...byId.values()].sort((a, b) => a.fund_name.localeCompare(b.fund_name, "he"));
}

/** CKAN query URL for one fund's history, newest first. */
export function fundHistoryUrl(
  fundId: number,
  source: FundSource,
  limit = 36,
): string {
  const params = new URLSearchParams({
    resource_id: FUND_RESOURCES[source],
    limit: String(limit),
    sort: "REPORT_PERIOD desc",
  });
  params.set("filters", JSON.stringify({ FUND_ID: fundId }));
  return `${CKAN_BASE}?${params.toString()}`;
}

/** CKAN query URL for the most recent rows across all funds. */
export function latestYieldsUrl(source: FundSource, limit = 5000): string {
  const params = new URLSearchParams({
    resource_id: FUND_RESOURCES[source],
    limit: String(limit),
    sort: "REPORT_PERIOD desc",
  });
  return `${CKAN_BASE}?${params.toString()}`;
}

/**
 * Free-text search over fund names.
 *
 * Nobody knows their fund's gemel-net FUND_ID — the number on your statement
 * is a policy or member number, not this. So the app has to find the fund by
 * name ("מיטב גמל לבני 50 עד 60" is 103) rather than asking for an id.
 */
export function fundSearchUrl(
  query: string,
  source: FundSource,
  limit = 300,
): string {
  const params = new URLSearchParams({
    resource_id: FUND_RESOURCES[source],
    q: query,
    limit: String(limit),
    sort: "REPORT_PERIOD desc",
  });
  return `${CKAN_BASE}?${params.toString()}`;
}

/**
 * Search funds by name. Each fund appears once per reported month, so the
 * results are deduplicated down to distinct funds.
 */
export async function searchFunds(
  query: string,
  source: FundSource,
): Promise<FundOption[]> {
  if (query.trim().length < 2) return [];
  try {
    const res = await fetch(fundSearchUrl(query.trim(), source), {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return [];
    return parseFundOptions(await res.json(), source);
  } catch {
    return [];
  }
}

/**
 * Fetch one fund's recent monthly yields. Returns [] on any failure.
 *
 * Deliberately uncached: this runs from an explicit "refresh" action, and
 * caching it for hours means a single bad response — a transient upstream
 * error, or a request made while the fund link was still wrong — keeps being
 * replayed long after the underlying problem is fixed.
 */
export async function fetchFundHistory(
  fundId: number,
  source: FundSource,
  limit = 36,
): Promise<FundYieldRow[]> {
  try {
    const res = await fetch(fundHistoryUrl(fundId, source, limit), {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseFundYields(await res.json(), source);
  } catch {
    return [];
  }
}
