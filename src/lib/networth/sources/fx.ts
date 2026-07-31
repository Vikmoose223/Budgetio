/**
 * Foreign exchange, ILS-quoted.
 *
 * Frankfurter (ECB-derived) is keyless and publishes ILS. The Bank of Israel's
 * `edge.boi.gov.il` SDMX endpoint was tried first and returns an error page,
 * so it isn't used.
 */

export type FxRow = { base: string; quote: string; as_of: string; rate: number };

export const FX_BASES = ["USD", "EUR"] as const;

/** Frankfurter quotes one base per call; ILS is the target for all of them. */
export function fxUrl(base: string): string {
  return `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(
    base,
  )}&symbols=ILS`;
}

/** Map a Frankfurter payload to a single ILS-quoted row. */
export function parseFx(payload: unknown): FxRow | null {
  const p = payload as {
    base?: string;
    date?: string;
    rates?: Record<string, unknown>;
  };
  const base = typeof p?.base === "string" ? p.base : null;
  const asOf = typeof p?.date === "string" ? p.date : null;
  const rate = Number(p?.rates?.ILS);
  if (!base || !asOf || !Number.isFinite(rate)) return null;
  return { base, quote: "ILS", as_of: asOf, rate };
}

/** Fetch ILS rates for each base. Silently skips any that fail. */
export async function fetchFxRates(
  bases: readonly string[] = FX_BASES,
): Promise<FxRow[]> {
  const rows: FxRow[] = [];
  for (const base of bases) {
    try {
      const res = await fetch(fxUrl(base), { cache: "no-store" });
      if (!res.ok) continue;
      const row = parseFx(await res.json());
      if (row) rows.push(row);
    } catch {
      // Leave this base out; the cached rate stays in play.
    }
  }
  return rows;
}
