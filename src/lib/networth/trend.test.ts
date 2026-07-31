import { expect, test, describe } from "vitest";
import { netWorthTrend, endOfMonth } from "./trend";
import { fxTableFrom } from "./currency";
import type { LiabilityRow } from "./value";

const fx = fxTableFrom([{ base: "USD", quote: "ILS", rate: 3 }]);

describe("endOfMonth", () => {
  test("handles 30- and 31-day months", () => {
    expect(endOfMonth("2026-07-01")).toBe("2026-07-31");
    expect(endOfMonth("2026-06-01")).toBe("2026-06-30");
  });

  test("handles February in a leap year", () => {
    expect(endOfMonth("2024-02-01")).toBe("2024-02-29");
    expect(endOfMonth("2026-02-01")).toBe("2026-02-28");
  });

  test("handles December", () => {
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
  });
});

describe("netWorthTrend", () => {
  const months = ["2026-05-01", "2026-06-01", "2026-07-01"];

  test("uses the latest recorded value at or before each month end", () => {
    const points = netWorthTrend(
      months,
      [
        {
          id: "a",
          currency: "ILS",
          valuations: [
            { as_of: "2026-05-31", value: 100_000 },
            { as_of: "2026-07-15", value: 120_000 },
          ],
        },
      ],
      [],
      fx,
    );
    expect(points[0].net).toBe(100_000);
    // June has no new reading, so May's carries forward.
    expect(points[1].net).toBe(100_000);
    expect(points[2].net).toBe(120_000);
  });

  test("never back-projects a value onto months before it was recorded", () => {
    const points = netWorthTrend(
      months,
      [{ id: "a", currency: "ILS", valuations: [{ as_of: "2026-07-10", value: 50_000 }] }],
      [],
      fx,
    );
    expect(points[0].net).toBe(0);
    expect(points[0].partial).toBe(true);
    expect(points[2].net).toBe(50_000);
    expect(points[2].partial).toBe(false);
  });

  test("subtracts the loan balance as it stood that month", () => {
    const loan: LiabilityRow = {
      id: "l",
      name: "הלוואה",
      kind: "personal_loan",
      owner_profile_id: null,
      currency: "ILS",
      principal: 120_000,
      annual_rate: 0,
      term_months: 120,
      start_date: "2026-01-01",
      payment_amount: null,
      linkage: "none",
      balance_override: null,
      balance_override_as_of: null,
    };
    const points = netWorthTrend(
      months,
      [
        {
          id: "a",
          currency: "ILS",
          valuations: [{ as_of: "2026-01-01", value: 200_000 }],
        },
      ],
      [loan],
      fx,
    );
    // The balance falls month over month, so net worth rises.
    expect(points[0].liabilities).toBeGreaterThan(points[2].liabilities);
    expect(points[2].net).toBeGreaterThan(points[0].net);
  });

  test("a loan that has not started yet contributes nothing", () => {
    const loan: LiabilityRow = {
      id: "l",
      name: "עתידית",
      kind: "personal_loan",
      owner_profile_id: null,
      currency: "ILS",
      principal: 100_000,
      annual_rate: 5,
      term_months: 60,
      start_date: "2026-07-01",
      payment_amount: null,
      linkage: "none",
      balance_override: null,
      balance_override_as_of: null,
    };
    const points = netWorthTrend(months, [], [loan], fx);
    expect(points[0].liabilities).toBe(0);
    expect(points[2].liabilities).toBeGreaterThan(0);
  });

  test("converts foreign-currency accounts", () => {
    const points = netWorthTrend(
      ["2026-07-01"],
      [
        {
          id: "a",
          currency: "USD",
          valuations: [{ as_of: "2026-07-01", value: 10_000 }],
        },
      ],
      [],
      fx,
    );
    expect(points[0].assets).toBe(30_000);
  });

  test("an empty portfolio produces zeroes, not NaN", () => {
    const points = netWorthTrend(months, [], [], fx);
    expect(points.every((p) => p.net === 0)).toBe(true);
    expect(points.every((p) => !Number.isNaN(p.net))).toBe(true);
  });
});
