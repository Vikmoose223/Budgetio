import { expect, test, describe } from "vitest";
import {
  parseFundYields,
  parseFundOptions,
  fundHistoryUrl,
  fundSearchUrl,
} from "./gemelnet";
import {
  parseQuote,
  parseCoinPrices,
  parseCoinSearch,
  parseEquitySearch,
  parseHistoricalQuote,
  parseCoinHistory,
  coinHistoryUrl,
} from "./prices";
import { parseFx } from "./fx";
import { parseCpi, cpiRatio } from "./cpi";

/**
 * Fixtures below are trimmed copies of real responses recorded on 2026-07-31,
 * so a change in an upstream response shape shows up as a test failure rather
 * than as a silently wrong net worth.
 */

// --- data.gov.il / גמל-נט -------------------------------------------------

const GEMELNET_PAYLOAD = {
  result: {
    records: [
      {
        _id: 1,
        FUND_ID: 101,
        FUND_NAME: 'הראל אג"ח עד 25% מניות',
        MANAGING_CORPORATION: "הראל פנסיה וגמל בע\"מ",
        REPORT_PERIOD: 202401,
        MONTHLY_YIELD: 0.2,
        YEAR_TO_DATE_YIELD: 0.2,
        AVG_ANNUAL_MANAGEMENT_FEE: 0.61,
        SHARPE_RATIO: 0.47,
      },
      {
        _id: 2,
        FUND_ID: 101,
        FUND_NAME: 'הראל אג"ח עד 25% מניות',
        MANAGING_CORPORATION: "הראל פנסיה וגמל בע\"מ",
        REPORT_PERIOD: 202402,
        MONTHLY_YIELD: 1.14,
        YEAR_TO_DATE_YIELD: 1.34,
        AVG_ANNUAL_MANAGEMENT_FEE: 0.61,
        SHARPE_RATIO: 0.5,
      },
      {
        _id: 3,
        FUND_ID: 202,
        FUND_NAME: "מיטב גמל לבני 50 עד 60",
        MANAGING_CORPORATION: "מיטב גמל ופנסיה בע\"מ",
        REPORT_PERIOD: 202606,
        MONTHLY_YIELD: -0.46,
        YEAR_TO_DATE_YIELD: 5.63,
        AVG_ANNUAL_MANAGEMENT_FEE: null,
        SHARPE_RATIO: null,
      },
    ],
  },
};

describe("parseFundYields", () => {
  test("maps the real CKAN shape", () => {
    const rows = parseFundYields(GEMELNET_PAYLOAD, "gemel");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      fund_id: 101,
      source: "gemel",
      report_period: 202401,
      fund_name: 'הראל אג"ח עד 25% מניות',
      managing_corp: "הראל פנסיה וגמל בע\"מ",
      monthly_yield: 0.2,
      ytd_yield: 0.2,
      avg_mgmt_fee: 0.61,
      sharpe_ratio: 0.47,
    });
  });

  test("keeps negative monthly yields", () => {
    const rows = parseFundYields(GEMELNET_PAYLOAD, "gemel");
    expect(rows[2].monthly_yield).toBe(-0.46);
  });

  test("nulls stay null instead of becoming 0", () => {
    const rows = parseFundYields(GEMELNET_PAYLOAD, "gemel");
    expect(rows[2].avg_mgmt_fee).toBeNull();
    expect(rows[2].sharpe_ratio).toBeNull();
  });

  test("numeric strings are coerced", () => {
    const rows = parseFundYields(
      { result: { records: [{ FUND_ID: "77", REPORT_PERIOD: "202605", MONTHLY_YIELD: "1.5" }] } },
      "pension",
    );
    expect(rows[0].fund_id).toBe(77);
    expect(rows[0].monthly_yield).toBe(1.5);
  });

  test("rows without a fund id or period are dropped", () => {
    const rows = parseFundYields(
      { result: { records: [{ FUND_NAME: "בלי מזהה" }, { FUND_ID: 5 }] } },
      "gemel",
    );
    expect(rows).toEqual([]);
  });

  test("malformed payloads yield an empty list, never a throw", () => {
    expect(parseFundYields(null, "gemel")).toEqual([]);
    expect(parseFundYields({}, "gemel")).toEqual([]);
    expect(parseFundYields({ result: { records: "nope" } }, "gemel")).toEqual([]);
  });
});

describe("parseFundOptions", () => {
  test("deduplicates funds across months", () => {
    const options = parseFundOptions(GEMELNET_PAYLOAD, "gemel");
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.fund_id).sort()).toEqual([101, 202]);
  });
});

describe("fundSearchUrl", () => {
  test("searches by name rather than requiring the internal id", () => {
    // Nobody knows their fund's FUND_ID — the number on a statement is a
    // policy number. Search by name is the only workable entry point.
    const url = fundSearchUrl("מיטב", "gemel");
    expect(decodeURIComponent(url)).toContain("q=מיטב");
    expect(url).toContain("resource_id=a30dcbea-a1d2-482c-ae29-8f781f5025fb");
  });

  test("pension searches hit the pension dataset", () => {
    expect(fundSearchUrl("מנורה", "pension")).toContain(
      "6d47d6b5-cb08-488b-b333-f1e717b1e1bd",
    );
  });
});

describe("fundHistoryUrl", () => {
  test("filters by fund and sorts newest first", () => {
    const url = fundHistoryUrl(101, "gemel", 12);
    expect(url).toContain("resource_id=a30dcbea-a1d2-482c-ae29-8f781f5025fb");
    expect(url).toContain("limit=12");
    expect(decodeURIComponent(url)).toContain('{"FUND_ID":101}');
    // URLSearchParams form-encodes the space as "+", which CKAN accepts
    // (verified against the live endpoint).
    expect(url).toContain("sort=REPORT_PERIOD+desc");
  });

  test("pension queries hit the pension resource", () => {
    expect(fundHistoryUrl(1, "pension")).toContain(
      "6d47d6b5-cb08-488b-b333-f1e717b1e1bd",
    );
  });
});

// --- Yahoo quotes ---------------------------------------------------------

const YAHOO_US = {
  chart: {
    error: null,
    result: [
      {
        meta: {
          symbol: "VOO",
          regularMarketPrice: 682.145,
          currency: "USD",
          fullExchangeName: "NYSEArca",
        },
      },
    ],
  },
};

const YAHOO_TASE = {
  chart: {
    error: null,
    result: [
      {
        meta: {
          symbol: "TEVA.TA",
          regularMarketPrice: 10870,
          currency: "ILA",
          fullExchangeName: "Tel Aviv",
        },
      },
    ],
  },
};

describe("parseQuote", () => {
  test("reads a US quote", () => {
    expect(parseQuote(YAHOO_US, "us", "2026-07-30")).toEqual({
      symbol: "VOO",
      market: "us",
      price: 682.145,
      currency: "USD",
      as_of: "2026-07-30",
    });
  });

  test("passes ILA through untouched for currency.ts to convert", () => {
    const quote = parseQuote(YAHOO_TASE, "tase", "2026-07-30");
    expect(quote?.currency).toBe("ILA");
    expect(quote?.price).toBe(10870);
  });

  test("an upstream error payload is null, not a bad price", () => {
    expect(
      parseQuote(
        { chart: { error: { code: "Not Found" }, result: null } },
        "tase",
        "2026-07-30",
      ),
    ).toBeNull();
  });

  test("missing or malformed fields are null", () => {
    expect(parseQuote({}, "us", "2026-07-30")).toBeNull();
    expect(parseQuote(null, "us", "2026-07-30")).toBeNull();
    expect(
      parseQuote({ chart: { result: [{ meta: { symbol: "X" } }] } }, "us", "2026-07-30"),
    ).toBeNull();
  });
});

describe("parseEquitySearch", () => {
  // Trimmed from the real /v1/finance/search?q=CSPX response on 2026-07-31.
  const CSPX_SEARCH = {
    quotes: [
      {
        symbol: "CSPX.L",
        exchange: "LSE",
        shortname: "ISHARES VII PLC ISHRS CORE S&P",
        quoteType: "ETF",
      },
      {
        symbol: "CSPX.AS",
        exchange: "AMS",
        longname: "iShares Core S&P 500 UCITS ETF USD (Acc)",
        quoteType: "ETF",
      },
      { symbol: "^GSPC", exchange: "SNP", shortname: "S&P 500", quoteType: "INDEX" },
      { symbol: "EURUSD=X", exchange: "CCY", shortname: "EUR/USD", quoteType: "CURRENCY" },
    ],
  };

  test("finds listings the bare ticker never could", () => {
    // CSPX is on the LSE and Amsterdam — quoting "CSPX" alone finds neither.
    const matches = parseEquitySearch(CSPX_SEARCH);
    expect(matches.map((m) => m.symbol)).toEqual(["CSPX.L", "CSPX.AS"]);
  });

  test("keeps the exchange so the right listing can be chosen", () => {
    const matches = parseEquitySearch(CSPX_SEARCH);
    expect(matches[0].exchange).toBe("LSE");
    expect(matches[1].exchange).toBe("AMS");
  });

  test("prefers the long name when there is one", () => {
    const matches = parseEquitySearch(CSPX_SEARCH);
    expect(matches[1].name).toBe("iShares Core S&P 500 UCITS ETF USD (Acc)");
  });

  test("drops indices and currencies, which can't be held", () => {
    const symbols = parseEquitySearch(CSPX_SEARCH).map((m) => m.symbol);
    expect(symbols).not.toContain("^GSPC");
    expect(symbols).not.toContain("EURUSD=X");
  });

  test("a .TA symbol is tagged as the Tel Aviv market", () => {
    const [m] = parseEquitySearch({
      quotes: [{ symbol: "TEVA.TA", exchange: "TLV", shortname: "Teva", quoteType: "EQUITY" }],
    });
    expect(m.market).toBe("tase");
  });

  test("malformed payloads are empty, never a throw", () => {
    expect(parseEquitySearch(null)).toEqual([]);
    expect(parseEquitySearch({ quotes: "nope" })).toEqual([]);
    expect(parseEquitySearch({ quotes: [{ exchange: "LSE" }] })).toEqual([]);
  });
});

describe("parseHistoricalQuote", () => {
  // Real shape, three consecutive trading days around 2026-03-16.
  const HISTORY = {
    chart: {
      error: null,
      result: [
        {
          meta: { currency: "USD", symbol: "CSPX.L" },
          timestamp: [
            Math.floor(Date.UTC(2026, 2, 16) / 1000),
            Math.floor(Date.UTC(2026, 2, 17) / 1000),
            Math.floor(Date.UTC(2026, 2, 18) / 1000),
          ],
          indicators: { quote: [{ close: [717.87, 721.96, 716.48] }] },
        },
      ],
    },
  };

  test("returns the close on the requested day", () => {
    const h = parseHistoricalQuote(HISTORY, "2026-03-16");
    expect(h?.price).toBeCloseTo(717.87, 4);
    expect(h?.currency).toBe("USD");
    expect(h?.as_of).toBe("2026-03-16");
  });

  test("falls back to the last trading day before a closed market", () => {
    // 2026-03-19 has no bar; the 18th is the most recent one.
    const h = parseHistoricalQuote(HISTORY, "2026-03-19");
    expect(h?.as_of).toBe("2026-03-18");
    expect(h?.price).toBeCloseTo(716.48, 4);
  });

  test("never reaches forward past the requested date", () => {
    // Pricing a purchase with a later close would use information that
    // didn't exist when the trade happened.
    const h = parseHistoricalQuote(HISTORY, "2026-03-17");
    expect(h?.as_of).toBe("2026-03-17");
    expect(h?.price).toBeCloseTo(721.96, 4);
  });

  test("nothing before the requested date yields null", () => {
    expect(parseHistoricalQuote(HISTORY, "2026-01-01")).toBeNull();
  });

  test("null closes (halted days) are skipped", () => {
    const withGap = {
      chart: {
        result: [
          {
            meta: { currency: "USD" },
            timestamp: [
              Math.floor(Date.UTC(2026, 2, 16) / 1000),
              Math.floor(Date.UTC(2026, 2, 17) / 1000),
            ],
            indicators: { quote: [{ close: [700, null] }] },
          },
        ],
      },
    };
    const h = parseHistoricalQuote(withGap, "2026-03-17");
    expect(h?.as_of).toBe("2026-03-16");
    expect(h?.price).toBe(700);
  });

  test("malformed payloads are null", () => {
    expect(parseHistoricalQuote(null, "2026-03-16")).toBeNull();
    expect(parseHistoricalQuote({ chart: { error: { code: "x" } } }, "2026-03-16")).toBeNull();
  });
});

describe("coinHistoryUrl / parseCoinHistory", () => {
  test("formats the date as CoinGecko's DD-MM-YYYY", () => {
    // Easy to get subtly wrong, and a swapped day/month silently returns the
    // price from a different day rather than an error.
    expect(coinHistoryUrl("ripple", "2026-03-16")).toContain("date=16-03-2026");
  });

  test("reads the ILS price", () => {
    const h = parseCoinHistory(
      { market_data: { current_price: { ils: 4.5535, usd: 1.4582 } } },
      "2026-03-16",
    );
    expect(h?.price).toBeCloseTo(4.5535, 4);
    expect(h?.currency).toBe("ILS");
    expect(h?.as_of).toBe("2026-03-16");
  });

  test("a payload without an ILS price is null", () => {
    expect(parseCoinHistory({ market_data: { current_price: { usd: 1 } } }, "2026-03-16"))
      .toBeNull();
    expect(parseCoinHistory(null, "2026-03-16")).toBeNull();
  });
});

describe("parseCoinSearch", () => {
  // Trimmed from the real /search?query=xrp response on 2026-07-31.
  const XRP_SEARCH = {
    coins: [
      { id: "army-3", symbol: "ARMY", name: "XRP ARMY", market_cap_rank: 1796 },
      { id: "ripple", symbol: "XRP", name: "XRP", market_cap_rank: 6 },
      { id: "xrp-healthcare", symbol: "XRPH", name: "XRP Healthcare", market_cap_rank: 2600 },
      {
        id: "harrypotterobamapacman8inu",
        symbol: "XRP",
        name: "HarryPotterObamaPacMan8Inu",
        market_cap_rank: 4646,
      },
    ],
  };

  test("resolves the ticker people type to the id the API needs", () => {
    const matches = parseCoinSearch(XRP_SEARCH);
    // This is the whole point: typing "XRP" has to reach "ripple".
    expect(matches[0].symbol).toBe("ripple");
    expect(matches[0].ticker).toBe("XRP");
    expect(matches[0].name).toBe("XRP");
  });

  test("ranks by market cap so impostors don't win", () => {
    const matches = parseCoinSearch(XRP_SEARCH);
    expect(matches.map((m) => m.symbol)).toEqual([
      "ripple",
      "army-3",
      "xrp-healthcare",
      "harrypotterobamapacman8inu",
    ]);
  });

  test("coins with no rank sort last rather than crashing", () => {
    const matches = parseCoinSearch({
      coins: [
        { id: "unranked", symbol: "U", name: "Unranked" },
        { id: "ranked", symbol: "R", name: "Ranked", market_cap_rank: 3 },
      ],
    });
    expect(matches.map((m) => m.symbol)).toEqual(["ranked", "unranked"]);
  });

  test("everything is tagged as crypto", () => {
    expect(parseCoinSearch(XRP_SEARCH).every((m) => m.market === "crypto")).toBe(true);
  });

  test("respects the result limit", () => {
    expect(parseCoinSearch(XRP_SEARCH, 2)).toHaveLength(2);
  });

  test("malformed payloads are empty, never a throw", () => {
    expect(parseCoinSearch(null)).toEqual([]);
    expect(parseCoinSearch({})).toEqual([]);
    expect(parseCoinSearch({ coins: "nope" })).toEqual([]);
    expect(parseCoinSearch({ coins: [{ symbol: "X" }] })).toEqual([]);
  });
});

describe("parseCoinPrices", () => {
  test("reads ILS quotes", () => {
    const rows = parseCoinPrices(
      { bitcoin: { ils: 194018 }, ethereum: { ils: 5726.08 } },
      "2026-07-31",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      symbol: "bitcoin",
      market: "crypto",
      price: 194018,
      currency: "ILS",
      as_of: "2026-07-31",
    });
  });

  test("skips coins without an ILS quote", () => {
    const rows = parseCoinPrices({ bitcoin: { usd: 63256 } }, "2026-07-31");
    expect(rows).toEqual([]);
  });

  test("malformed payloads are empty", () => {
    expect(parseCoinPrices(null, "2026-07-31")).toEqual([]);
  });
});

// --- Frankfurter FX -------------------------------------------------------

describe("parseFx", () => {
  test("reads the real payload", () => {
    expect(
      parseFx({ amount: 1.0, base: "USD", date: "2026-07-30", rates: { ILS: 3.0695 } }),
    ).toEqual({ base: "USD", quote: "ILS", as_of: "2026-07-30", rate: 3.0695 });
  });

  test("a payload without ILS is null", () => {
    expect(parseFx({ base: "USD", date: "2026-07-30", rates: { EUR: 0.92 } })).toBeNull();
    expect(parseFx(null)).toBeNull();
  });
});

// --- CBS CPI --------------------------------------------------------------

const CBS_PAYLOAD = {
  month: [
    {
      code: 120010,
      name: "מדד המחירים לצרכן - כללי",
      date: [
        { year: 2026, month: 6, currBase: { value: 104.8 }, percentYear: 1.6 },
        { year: 2026, month: 5, currBase: { value: 104.8 }, percentYear: 1.9 },
        { year: 2026, month: 4, currBase: { value: 105.1 }, percentYear: 1.9 },
      ],
    },
  ],
};

describe("parseCpi", () => {
  test("maps the real CBS shape to YYYYMM rows", () => {
    const rows = parseCpi(CBS_PAYLOAD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ period: 202606, value: 104.8 });
    expect(rows[2]).toEqual({ period: 202604, value: 105.1 });
  });

  test("malformed payloads are empty", () => {
    expect(parseCpi(null)).toEqual([]);
    expect(parseCpi({ month: "nope" })).toEqual([]);
  });
});

describe("cpiRatio", () => {
  const rows = [
    { period: 202001, value: 100 },
    { period: 202601, value: 115 },
    { period: 202606, value: 120 },
  ];

  test("divides the later index by the earlier", () => {
    expect(cpiRatio(rows, 202001, 202601)).toBeCloseTo(1.15, 6);
  });

  test("falls back to the latest month at or before an unpublished target", () => {
    // 202603 isn't published; 202601 is the most recent one that is.
    expect(cpiRatio(rows, 202001, 202603)).toBeCloseTo(1.15, 6);
  });

  test("returns 1 when the data can't support a ratio", () => {
    expect(cpiRatio([], 202001, 202601)).toBe(1);
    // A start date earlier than anything published.
    expect(cpiRatio(rows, 199001, 202601)).toBe(1);
  });

  test("never returns NaN", () => {
    expect(Number.isNaN(cpiRatio([{ period: 202001, value: 0 }], 202001, 202601))).toBe(
      false,
    );
  });
});
