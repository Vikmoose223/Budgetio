/**
 * Market prices.
 *
 * Equities/ETFs (US **and** Tel Aviv) come from Yahoo's chart endpoint, which
 * is unofficial: it has no SLA and can change without notice. Every parse
 * failure therefore degrades to "no price" and the app keeps showing the last
 * cached value rather than dropping the asset out of net worth.
 *
 * Crypto comes from CoinGecko, which quotes ILS directly.
 */

export type Market = "us" | "tase" | "crypto";

export type QuotedPrice = {
  symbol: string;
  market: Market;
  price: number;
  /** As reported: USD, ILS, or ILA (agorot) for Tel Aviv. */
  currency: string;
  as_of: string;
};

export function quoteUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=5d`;
}

export function coinGeckoUrl(ids: string[]): string {
  return `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(","),
  )}&vs_currencies=ils`;
}

/**
 * Pull the quote out of a Yahoo chart payload.
 *
 * Note the currency is passed straight through — Tel Aviv reports `ILA`
 * (agorot) and the conversion to shekels happens in `currency.ts`, not here.
 */
export function parseQuote(
  payload: unknown,
  market: Market,
  asOf: string,
): QuotedPrice | null {
  const chart = (payload as { chart?: { result?: unknown[]; error?: unknown } })?.chart;
  if (!chart || chart.error) return null;

  const meta = (chart.result?.[0] as { meta?: Record<string, unknown> })?.meta;
  if (!meta) return null;

  const price = Number(meta.regularMarketPrice);
  const symbol = typeof meta.symbol === "string" ? meta.symbol : null;
  const currency = typeof meta.currency === "string" ? meta.currency : null;
  if (!symbol || !currency || !Number.isFinite(price)) return null;

  return { symbol, market, price, currency, as_of: asOf };
}

/** Map a CoinGecko `simple/price` payload to rows, quoted in ILS. */
export function parseCoinPrices(payload: unknown, asOf: string): QuotedPrice[] {
  if (!payload || typeof payload !== "object") return [];
  const rows: QuotedPrice[] = [];
  for (const [id, value] of Object.entries(payload as Record<string, unknown>)) {
    const ils = Number((value as Record<string, unknown>)?.ils);
    if (!Number.isFinite(ils)) continue;
    rows.push({ symbol: id, market: "crypto", price: ils, currency: "ILS", as_of: asOf });
  }
  return rows;
}

/** Fetch one equity/ETF quote. Null on any failure — never throws. */
export async function fetchQuote(
  symbol: string,
  market: Market,
  asOf: string,
): Promise<QuotedPrice | null> {
  try {
    const res = await fetch(quoteUrl(symbol), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; budgetio/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseQuote(await res.json(), market, asOf);
  } catch {
    return null;
  }
}

/** Fetch crypto prices in one call. Empty on failure. */
export async function fetchCoinPrices(
  ids: string[],
  asOf: string,
): Promise<QuotedPrice[]> {
  if (ids.length === 0) return [];
  try {
    const res = await fetch(coinGeckoUrl(ids), { cache: "no-store" });
    if (!res.ok) return [];
    return parseCoinPrices(await res.json(), asOf);
  } catch {
    return [];
  }
}
