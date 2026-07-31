import { expect, test, describe } from "vitest";
import {
  valueAccount,
  valueLiability,
  priceIndex,
  type AccountRow,
  type LiabilityRow,
} from "./value";
import { fxTableFrom } from "./currency";

const fx = fxTableFrom([{ base: "USD", quote: "ILS", rate: 3.0695 }]);

const account = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: "a1",
  name: "חשבון",
  kind: "brokerage",
  owner_profile_id: null,
  currency: "ILS",
  fund_id: null,
  fund_source: null,
  ...over,
});

const EMPTY = {
  holdings: [],
  prices: new Map(),
  valuations: [],
  flows: [],
  yields: [],
  fx,
  asOf: "2026-07-31",
};

describe("priceIndex", () => {
  test("keeps the most recent row per symbol+market", () => {
    const index = priceIndex([
      { symbol: "VOO", market: "us", price: 600, currency: "USD", as_of: "2026-07-29" },
      { symbol: "VOO", market: "us", price: 682, currency: "USD", as_of: "2026-07-30" },
    ]);
    expect(index.get("us:VOO")?.price).toBe(682);
  });

  test("separates the same symbol on different markets", () => {
    const index = priceIndex([
      { symbol: "X", market: "us", price: 10, currency: "USD", as_of: "2026-07-30" },
      { symbol: "X", market: "tase", price: 900, currency: "ILA", as_of: "2026-07-30" },
    ]);
    expect(index.get("us:X")?.price).toBe(10);
    expect(index.get("tase:X")?.price).toBe(900);
  });
});

describe("valueAccount — holdings", () => {
  test("prices a US holding through FX", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      holdings: [{ symbol: "VOO", quantity: 10, market: "us" }],
      prices: priceIndex([
        { symbol: "VOO", market: "us", price: 682.145, currency: "USD", as_of: "2026-07-30" },
      ]),
    });
    // 10 × 682.145 USD × 3.0695
    expect(result.value).toBeCloseTo(20938.44, 1);
    expect(result.basis).toBe("holdings");
    expect(result.estimated).toBe(false);
  });

  test("prices a TASE holding out of agorot", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      holdings: [{ symbol: "TEVA.TA", quantity: 100, market: "tase" }],
      prices: priceIndex([
        { symbol: "TEVA.TA", market: "tase", price: 10870, currency: "ILA", as_of: "2026-07-30" },
      ]),
    });
    // 100 shares at ₪108.70 = ₪10,870 — not ₪1,087,000.
    expect(result.value).toBeCloseTo(10870, 2);
  });

  test("mixed markets sum correctly in one account", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      holdings: [
        { symbol: "VOO", quantity: 10, market: "us" },
        { symbol: "TEVA.TA", quantity: 100, market: "tase" },
      ],
      prices: priceIndex([
        { symbol: "VOO", market: "us", price: 682.145, currency: "USD", as_of: "2026-07-30" },
        { symbol: "TEVA.TA", market: "tase", price: 10870, currency: "ILA", as_of: "2026-07-30" },
      ]),
    });
    expect(result.value).toBeCloseTo(20938.44 + 10870, 0);
  });

  test("a lower-case CoinGecko id matches its cached price", () => {
    // Crypto is stored as CoinGecko's id ("ripple"), not the ticker ("XRP").
    // Both sides must key identically or the holding silently never prices —
    // which looked exactly like the feature being broken.
    const result = valueAccount({
      ...EMPTY,
      account: account({ kind: "crypto" }),
      holdings: [{ symbol: "ripple", quantity: 1000, market: "crypto" }],
      prices: priceIndex([
        { symbol: "ripple", market: "crypto", price: 3.27, currency: "ILS", as_of: "2026-07-31" },
      ]),
    });
    expect(result.value).toBeCloseTo(3270, 2);
    expect(result.basis).toBe("holdings");
    expect(result.unpricedSymbols).toEqual([]);
  });

  test("symbol casing doesn't break the match either way", () => {
    const prices = priceIndex([
      { symbol: "ripple", market: "crypto", price: 3.27, currency: "ILS", as_of: "2026-07-31" },
    ]);
    // A holding saved before ids were normalised must still resolve.
    const result = valueAccount({
      ...EMPTY,
      account: account({ kind: "crypto" }),
      holdings: [{ symbol: "RIPPLE", quantity: 100, market: "crypto" }],
      prices,
    });
    expect(result.value).toBeCloseTo(327, 2);
  });

  test("unpriced symbols are reported, not silently dropped", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      holdings: [
        { symbol: "VOO", quantity: 10, market: "us" },
        { symbol: "5121567", quantity: 50, market: "tase" },
      ],
      prices: priceIndex([
        { symbol: "VOO", market: "us", price: 100, currency: "USD", as_of: "2026-07-30" },
      ]),
    });
    expect(result.unpricedSymbols).toEqual(["5121567"]);
    expect(result.value).toBeCloseTo(3069.5, 1);
  });

  test("falls back to the manual balance when nothing can be priced", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      holdings: [{ symbol: "UNKNOWN", quantity: 5, market: "us" }],
      valuations: [{ as_of: "2026-06-30", value: 50000 }],
    });
    expect(result.basis).toBe("anchor");
    expect(result.value).toBe(50000);
  });
});

describe("valueAccount — anchor and drift", () => {
  test("a plain manual balance is used as-is", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account({ kind: "real_estate" }),
      valuations: [{ as_of: "2026-01-01", value: 2_000_000 }],
    });
    expect(result.value).toBe(2_000_000);
    expect(result.basis).toBe("anchor");
    expect(result.estimated).toBe(false);
    expect(result.asOf).toBe("2026-01-01");
  });

  test("the newest valuation wins", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account({ kind: "cash" }),
      valuations: [
        { as_of: "2026-01-01", value: 10_000 },
        { as_of: "2026-06-01", value: 25_000 },
        { as_of: "2026-03-01", value: 15_000 },
      ],
    });
    expect(result.value).toBe(25_000);
    expect(result.asOf).toBe("2026-06-01");
  });

  test("a pension account drifts on published yields and is flagged estimated", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account({ kind: "gemel", fund_id: 101, fund_source: "gemel" }),
      valuations: [{ as_of: "2026-03-31", value: 100_000 }],
      yields: [
        { report_period: 202604, monthly_yield: 1 },
        { report_period: 202605, monthly_yield: 1 },
      ],
    });
    expect(result.value).toBeCloseTo(102_010, 2);
    expect(result.basis).toBe("drift");
    expect(result.estimated).toBe(true);
    expect(result.lastYieldPeriod).toBe(202605);
    // asOf stays the date the value was genuinely known.
    expect(result.asOf).toBe("2026-03-31");
  });

  test("a foreign-currency anchor is converted", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account({ currency: "USD" }),
      valuations: [{ as_of: "2026-06-30", value: 10_000 }],
    });
    expect(result.value).toBeCloseTo(30_695, 1);
  });

  test("an account with nothing to value it on returns null, not zero", () => {
    const result = valueAccount({ ...EMPTY, account: account() });
    expect(result.value).toBeNull();
    expect(result.basis).toBe("none");
  });

  test("a return is computed when flows are known", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      valuations: [{ as_of: "2026-07-31", value: 1100 }],
      flows: [{ occurred_on: "2025-07-31", amount: 1000 }],
    });
    expect(result.returnRate).toBeCloseTo(0.1, 3);
  });

  test("no flows means no return rather than a fake 0%", () => {
    const result = valueAccount({
      ...EMPTY,
      account: account(),
      valuations: [{ as_of: "2026-07-31", value: 1100 }],
    });
    expect(result.returnRate).toBeNull();
  });
});

describe("valueLiability", () => {
  const mortgage = (over: Partial<LiabilityRow> = {}): LiabilityRow => ({
    id: "l1",
    name: "משכנתא",
    kind: "mortgage",
    owner_profile_id: null,
    currency: "ILS",
    principal: 1_000_000,
    annual_rate: 5,
    term_months: 360,
    start_date: "2020-01-01",
    payment_amount: null,
    linkage: "none",
    balance_override: null,
    balance_override_as_of: null,
    ...over,
  });

  test("computes the balance from the schedule", () => {
    const result = valueLiability(mortgage(), "2026-01-01", fx);
    expect(result.basis).toBe("computed");
    expect(result.balance).toBeGreaterThan(880_000);
    expect(result.balance).toBeLessThan(920_000);
    expect(result.monthlyPayment).toBeCloseTo(5368.22, 1);
  });

  test("a manual balance overrides the schedule", () => {
    const result = valueLiability(
      mortgage({ balance_override: 875_000, balance_override_as_of: "2026-07-01" }),
      "2026-07-31",
      fx,
    );
    expect(result.balance).toBe(875_000);
    expect(result.basis).toBe("anchor");
    expect(result.asOf).toBe("2026-07-01");
  });

  test("CPI linkage raises the balance", () => {
    const plain = valueLiability(mortgage(), "2026-01-01", fx, 1);
    const linked = valueLiability(
      mortgage({ linkage: "cpi" }),
      "2026-01-01",
      fx,
      1.15,
    );
    expect(linked.balance).toBeGreaterThan(plain.balance);
  });

  test("a foreign-currency loan is converted to ILS", () => {
    const result = valueLiability(
      mortgage({ currency: "USD", principal: 100_000, term_months: 120, annual_rate: 0 }),
      "2020-01-01",
      fx,
    );
    expect(result.balance).toBeCloseTo(100_000 * 3.0695, 0);
  });
});
