import { expect, test, describe } from "vitest";
import { driftFromAnchor, periodOf, nextPeriod } from "./drift";

describe("period helpers", () => {
  test("periodOf builds YYYYMM", () => {
    expect(periodOf("2026-07-31")).toBe(202607);
    expect(periodOf("2026-01-01")).toBe(202601);
  });

  test("nextPeriod rolls over the year", () => {
    expect(nextPeriod(202607)).toBe(202608);
    expect(nextPeriod(202612)).toBe(202701);
  });
});

describe("driftFromAnchor", () => {
  const anchor = { value: 100_000, as_of: "2026-03-31" };

  test("no yields and no flows leaves the anchor untouched", () => {
    const result = driftFromAnchor(anchor, [], [], "2026-07-31");
    expect(result.value).toBe(100_000);
    expect(result.estimated).toBe(false);
    expect(result.lastYieldPeriod).toBeNull();
  });

  test("compounds published monthly yields", () => {
    const result = driftFromAnchor(
      anchor,
      [
        { report_period: 202604, monthly_yield: 1 },
        { report_period: 202605, monthly_yield: 1 },
      ],
      [],
      "2026-07-31",
    );
    // 100,000 × 1.01 × 1.01
    expect(result.value).toBeCloseTo(102_010, 2);
    expect(result.estimated).toBe(true);
    expect(result.lastYieldPeriod).toBe(202605);
    expect(result.monthsApplied).toBe(2);
  });

  test("negative months reduce the value", () => {
    const result = driftFromAnchor(
      anchor,
      [{ report_period: 202604, monthly_yield: -0.46 }],
      [],
      "2026-07-31",
    );
    expect(result.value).toBeCloseTo(99_540, 2);
  });

  test("ignores yields at or before the anchor month", () => {
    const result = driftFromAnchor(
      anchor,
      [
        { report_period: 202601, monthly_yield: 5 },
        { report_period: 202603, monthly_yield: 5 },
        { report_period: 202604, monthly_yield: 1 },
      ],
      [],
      "2026-07-31",
    );
    // Only April's 1% applies; the anchor already reflects everything up to March.
    expect(result.value).toBeCloseTo(101_000, 2);
    expect(result.monthsApplied).toBe(1);
  });

  test("stops at the requested as-of date", () => {
    const result = driftFromAnchor(
      anchor,
      [
        { report_period: 202604, monthly_yield: 1 },
        { report_period: 202609, monthly_yield: 50 },
      ],
      [],
      "2026-07-31",
    );
    expect(result.value).toBeCloseTo(101_000, 2);
  });

  test("deposits are added but do not earn that month's return", () => {
    const result = driftFromAnchor(
      anchor,
      [{ report_period: 202604, monthly_yield: 10 }],
      [{ occurred_on: "2026-04-15", amount: 1000 }],
      "2026-04-30",
    );
    // 100,000 × 1.10 = 110,000, then + 1,000 — not (100,000+1,000) × 1.10.
    expect(result.value).toBeCloseTo(111_000, 2);
  });

  test("flows on or before the anchor date are already reflected in it", () => {
    const result = driftFromAnchor(
      anchor,
      [],
      [
        { occurred_on: "2026-02-01", amount: 5000 },
        { occurred_on: "2026-03-31", amount: 5000 },
      ],
      "2026-07-31",
    );
    expect(result.value).toBe(100_000);
  });

  test("flows land even in months with no published yield", () => {
    const result = driftFromAnchor(
      anchor,
      [{ report_period: 202604, monthly_yield: 0 }],
      [{ occurred_on: "2026-06-10", amount: 2500 }],
      "2026-07-31",
    );
    expect(result.value).toBeCloseTo(102_500, 2);
  });

  test("withdrawals reduce the balance", () => {
    const result = driftFromAnchor(
      anchor,
      [],
      [{ occurred_on: "2026-05-01", amount: -20_000 }],
      "2026-07-31",
    );
    expect(result.value).toBeCloseTo(80_000, 2);
  });

  test("null yields are skipped, not treated as zero-growth errors", () => {
    const result = driftFromAnchor(
      anchor,
      [
        { report_period: 202604, monthly_yield: null },
        { report_period: 202605, monthly_yield: 2 },
      ],
      [],
      "2026-07-31",
    );
    expect(result.value).toBeCloseTo(102_000, 2);
    expect(result.monthsApplied).toBe(1);
  });
});
