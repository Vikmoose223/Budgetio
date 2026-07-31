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

/**
 * Resolving what someone typed into something the APIs accept.
 *
 * This matters most for crypto: CoinGecko keys on its own **id**, not the
 * ticker. Typing "XRP" finds nothing — the id is "ripple". So the symbol box
 * searches rather than trusting the raw input.
 */
export type SymbolMatch = {
  /** The value to store and later price with. */
  symbol: string;
  name: string;
  /** The ticker as people say it, for display. */
  ticker: string;
  market: Market;
  /** Current price in the quoted currency, when we could get one. */
  price: number | null;
  currency: string | null;
};

export function coinSearchUrl(query: string): string {
  return `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
}

/** Map a CoinGecko `/search` payload to candidates, best-known coins first. */
export function parseCoinSearch(payload: unknown, limit = 6): SymbolMatch[] {
  const coins = (payload as { coins?: unknown[] })?.coins;
  if (!Array.isArray(coins)) return [];

  return coins
    .map((raw) => {
      const c = raw as Record<string, unknown>;
      const id = typeof c.id === "string" ? c.id : null;
      const name = typeof c.name === "string" ? c.name : null;
      const ticker = typeof c.symbol === "string" ? c.symbol : "";
      if (!id || !name) return null;
      const rank =
        typeof c.market_cap_rank === "number" ? c.market_cap_rank : Number.MAX_SAFE_INTEGER;
      return { id, name, ticker, rank };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // Rank ascending: "XRP" should surface ripple, not "XRP ARMY".
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((c) => ({
      symbol: c.id,
      name: c.name,
      ticker: c.ticker.toUpperCase(),
      market: "crypto" as Market,
      price: null,
      currency: null,
    }));
}

/** Search coins by ticker or name. Empty on failure. */
export async function searchCoins(query: string): Promise<SymbolMatch[]> {
  try {
    const res = await fetch(coinSearchUrl(query), { cache: "no-store" });
    if (!res.ok) return [];
    return parseCoinSearch(await res.json());
  } catch {
    return [];
  }
}

/**
 * Equity lookup: Yahoo has no keyless search endpoint we can rely on, so we
 * verify the symbol by quoting it directly. Tel Aviv symbols need the `.TA`
 * suffix, which is added automatically when the bare form doesn't resolve.
 */
export async function lookupEquity(
  query: string,
  market: "us" | "tase",
): Promise<SymbolMatch[]> {
  const raw = query.trim().toUpperCase();
  if (!raw) return [];

  const candidates =
    market === "tase"
      ? raw.endsWith(".TA")
        ? [raw]
        : [`${raw}.TA`, raw]
      : [raw];

  const asOf = new Date().toISOString().slice(0, 10);
  for (const candidate of candidates) {
    const quote = await fetchQuote(candidate, market, asOf);
    if (quote) {
      return [
        {
          symbol: quote.symbol,
          name: quote.symbol,
          ticker: quote.symbol,
          market,
          price: quote.price,
          currency: quote.currency,
        },
      ];
    }
  }
  return [];
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
