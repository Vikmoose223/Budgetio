import { expect, test, describe } from "vitest";
import { parseFundYields, parseFundOptions, fundHistoryUrl } from "./gemelnet";
import { parseQuote, parseCoinPrices, parseCoinSearch } from "./prices";
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
