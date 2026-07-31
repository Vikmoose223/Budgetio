import { expect, test, describe } from "vitest";
import { toILS, fxTableFrom } from "./currency";

const fx = fxTableFrom([
  { base: "USD", quote: "ILS", rate: 3.0695 },
  { base: "EUR", quote: "ILS", rate: 3.55 },
]);

describe("toILS", () => {
  test("ILS passes through untouched", () => {
    expect(toILS(1234.56, "ILS", fx)).toBe(1234.56);
  });

  test("ILA (agorot) is divided by 100 — the Tel Aviv trap", () => {
    // TEVA.TA quotes at 10870 agorot, which is ₪108.70 — not ₪10,870.
    expect(toILS(10870, "ILA", fx)).toBeCloseTo(108.7, 6);
    expect(toILS(7433, "ILA", fx)).toBeCloseTo(74.33, 6);
  });

  test("a TASE position is not inflated 100x", () => {
    // 100 shares of TEVA.TA at 10870 ILA = ₪10,870, not ₪1,087,000.
    const perShare = toILS(10870, "ILA", fx)!;
    expect(perShare * 100).toBeCloseTo(10870, 4);
  });

  test("foreign currencies use the FX table", () => {
    expect(toILS(100, "USD", fx)).toBeCloseTo(306.95, 6);
    expect(toILS(100, "EUR", fx)).toBeCloseTo(355, 6);
  });

  test("currency codes are case-insensitive", () => {
    expect(toILS(100, "usd", fx)).toBeCloseTo(306.95, 6);
    expect(toILS(10870, "ila", fx)).toBeCloseTo(108.7, 6);
  });

  test("an unknown currency yields null, never a silent pass-through", () => {
    expect(toILS(100, "JPY", fx)).toBeNull();
    expect(toILS(Number.NaN, "ILS", fx)).toBeNull();
  });
});

describe("fxTableFrom", () => {
  test("always contains ILS at parity", () => {
    expect(fxTableFrom([]).get("ILS")).toBe(1);
  });

  test("ignores rows not quoted in ILS", () => {
    const table = fxTableFrom([
      { base: "USD", quote: "EUR", rate: 0.92 },
      { base: "USD", quote: "ILS", rate: 3.07 },
    ]);
    expect(table.get("USD")).toBe(3.07);
  });
});
