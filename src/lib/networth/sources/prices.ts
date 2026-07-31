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
  /** Which exchange the listing is on — CSPX exists on LSE and Amsterdam. */
  exchange?: string | null;
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

export function equitySearchUrl(query: string): string {
  return `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query,
  )}&quotesCount=8&newsCount=0`;
}

/**
 * Map a Yahoo `/v1/finance/search` payload to candidates.
 *
 * Searching rather than guessing a suffix is what makes non-US listings
 * findable at all: CSPX is on the LSE as `CSPX.L` and Amsterdam as `CSPX.AS`,
 * and trying the bare ticker finds neither. The exchange is surfaced so the
 * right listing can be picked — they differ in currency and liquidity.
 */
export function parseEquitySearch(payload: unknown, limit = 8): SymbolMatch[] {
  const quotes = (payload as { quotes?: unknown[] })?.quotes;
  if (!Array.isArray(quotes)) return [];

  const out: SymbolMatch[] = [];
  for (const raw of quotes) {
    const q = raw as Record<string, unknown>;
    const symbol = typeof q.symbol === "string" ? q.symbol : null;
    if (!symbol) continue;
    // Only tradable instruments; drop indices, futures and currencies.
    const type = typeof q.quoteType === "string" ? q.quoteType : "";
    if (type && !["EQUITY", "ETF", "MUTUALFUND"].includes(type)) continue;

    const name =
      (typeof q.longname === "string" && q.longname) ||
      (typeof q.shortname === "string" && q.shortname) ||
      symbol;
    const exchange = typeof q.exchange === "string" ? q.exchange : null;

    out.push({
      symbol,
      name,
      ticker: symbol,
      market: symbol.toUpperCase().endsWith(".TA") ? "tase" : "us",
      price: null,
      currency: null,
      exchange,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Find equities and ETFs on any exchange.
 *
 * Falls back to quoting the raw input when search returns nothing, which
 * covers symbols the search index misses but the quote endpoint knows.
 */
export async function lookupEquity(
  query: string,
  market: "us" | "tase",
): Promise<SymbolMatch[]> {
  const raw = query.trim();
  if (!raw) return [];

  try {
    const res = await fetch(equitySearchUrl(raw), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; budgetio/1.0)" },
      cache: "no-store",
    });
    if (res.ok) {
      const matches = parseEquitySearch(await res.json());
      if (matches.length > 0) return matches;
    }
  } catch {
    // Fall through to a direct quote.
  }

  // Direct-quote fallback, with the Tel Aviv suffix tried first when relevant.
  const upper = raw.toUpperCase();
  const candidates =
    market === "tase" && !upper.endsWith(".TA") ? [`${upper}.TA`, upper] : [upper];
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
          exchange: null,
        },
      ];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Historical prices — "what did it cost on the day I bought it"
// ---------------------------------------------------------------------------

export type HistoricalPrice = {
  price: number;
  currency: string;
  /** The trading day actually used; markets are shut at weekends. */
  as_of: string;
};

function toUnixSeconds(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 1000);
}

export function historicalQuoteUrl(symbol: string, dateISO: string): string {
  // A window either side of the date, so a weekend or holiday still resolves
  // to the most recent trading day before it.
  const target = toUnixSeconds(dateISO);
  const from = target - 10 * 86_400;
  const to = target + 2 * 86_400;
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?period1=${from}&period2=${to}&interval=1d`;
}

/**
 * Pull the close on `dateISO`, or the last trading day before it.
 * Never reaches forward past the date — that would price a purchase using
 * information that didn't exist yet.
 */
export function parseHistoricalQuote(
  payload: unknown,
  dateISO: string,
): HistoricalPrice | null {
  const chart = (payload as { chart?: { result?: unknown[]; error?: unknown } })?.chart;
  if (!chart || chart.error) return null;

  const result = chart.result?.[0] as
    | {
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }
    | undefined;
  if (!result?.timestamp || !result.indicators?.quote?.[0]?.close) return null;

  const currency =
    typeof result.meta?.currency === "string" ? result.meta.currency : null;
  if (!currency) return null;

  const closes = result.indicators.quote[0].close;
  let best: HistoricalPrice | null = null;

  for (let i = 0; i < result.timestamp.length; i++) {
    const day = new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10);
    if (day > dateISO) break;
    const close = closes[i];
    if (close === null || close === undefined || !Number.isFinite(close)) continue;
    best = { price: close, currency, as_of: day };
  }

  return best;
}

/** CoinGecko wants DD-MM-YYYY, which is easy to get subtly wrong. */
export function coinHistoryUrl(id: string, dateISO: string): string {
  const [y, m, d] = dateISO.split("-");
  return `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id,
  )}/history?date=${d}-${m}-${y}&localization=false`;
}

export function parseCoinHistory(
  payload: unknown,
  dateISO: string,
): HistoricalPrice | null {
  const ils = Number(
    (payload as { market_data?: { current_price?: { ils?: unknown } } })?.market_data
      ?.current_price?.ils,
  );
  if (!Number.isFinite(ils)) return null;
  return { price: ils, currency: "ILS", as_of: dateISO };
}

/** Price of one unit on a past date. Null when unavailable. */
export async function fetchHistoricalPrice(
  symbol: string,
  market: Market,
  dateISO: string,
): Promise<HistoricalPrice | null> {
  try {
    if (market === "crypto") {
      const res = await fetch(coinHistoryUrl(symbol, dateISO), { cache: "no-store" });
      if (!res.ok) return null;
      return parseCoinHistory(await res.json(), dateISO);
    }
    const res = await fetch(historicalQuoteUrl(symbol, dateISO), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; budgetio/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseHistoricalQuote(await res.json(), dateISO);
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
