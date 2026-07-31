import { expect, test, describe } from "vitest";
import {
  summarizeIncome,
  cashFlow,
  incomeVsExpenseTrend,
  type IncomeRow,
} from "./income";

const income = (over: Partial<IncomeRow> = {}): IncomeRow => ({
  amount: 1000,
  occurred_on: "2026-07-10",
  source: "salary",
  ...over,
});

describe("summarizeIncome", () => {
  test("sums the total", () => {
    const s = summarizeIncome([
      income({ amount: 12000 }),
      income({ amount: 3000, source: "freelance" }),
    ]);
    expect(s.total).toBe(15000);
  });

  test("tracks the recurring portion separately", () => {
    const s = summarizeIncome([
      income({ amount: 12000, recurring: true }),
      income({ amount: 5000, source: "bonus", recurring: false }),
    ]);
    expect(s.total).toBe(17000);
    expect(s.recurringTotal).toBe(12000);
  });

  test("breaks down by source, largest first", () => {
    const s = summarizeIncome([
      income({ amount: 2000, source: "freelance" }),
      income({ amount: 12000, source: "salary" }),
      income({ amount: 500, source: "gift" }),
    ]);
    expect(s.bySource.map((b) => b.source)).toEqual(["salary", "freelance", "gift"]);
    expect(s.bySource[0].label).toBe("משכורת");
  });

  test("attributes income per partner, joint under null", () => {
    const s = summarizeIncome([
      income({ amount: 12000, owner_profile_id: "vik" }),
      income({ amount: 9000, owner_profile_id: "partner" }),
      income({ amount: 1000 }),
    ]);
    expect(s.byOwner.find((o) => o.ownerProfileId === "vik")!.amount).toBe(12000);
    expect(s.byOwner.find((o) => o.ownerProfileId === null)!.amount).toBe(1000);
    expect(s.byOwner.reduce((sum, o) => sum + o.amount, 0)).toBe(s.total);
  });

  test("an empty month is zero, not NaN", () => {
    const s = summarizeIncome([]);
    expect(s.total).toBe(0);
    expect(s.bySource).toEqual([]);
    expect(Number.isNaN(s.total)).toBe(false);
  });

  test("ignores malformed amounts rather than poisoning the total", () => {
    const s = summarizeIncome([
      income({ amount: 1000 }),
      income({ amount: Number.NaN }),
    ]);
    expect(s.total).toBe(1000);
  });
});

describe("cashFlow", () => {
  test("net is income minus expenses", () => {
    const c = cashFlow(20000, 15000);
    expect(c.net).toBe(5000);
    expect(c.savingsRate).toBeCloseTo(0.25, 6);
    expect(c.spentShare).toBeCloseTo(0.75, 6);
  });

  test("a deficit month is negative", () => {
    const c = cashFlow(10000, 13000);
    expect(c.net).toBe(-3000);
    expect(c.savingsRate).toBeCloseTo(-0.3, 6);
  });

  test("no income means no rate rather than a divide-by-zero", () => {
    const c = cashFlow(0, 5000);
    expect(c.net).toBe(-5000);
    expect(c.savingsRate).toBeNull();
    expect(c.spentShare).toBeNull();
  });

  test("spending nothing keeps all of it", () => {
    expect(cashFlow(10000, 0).savingsRate).toBe(1);
  });
});

describe("incomeVsExpenseTrend", () => {
  test("buckets both series into the same months", () => {
    const points = incomeVsExpenseTrend(
      "2026-07-01",
      3,
      [
        { amount: 12000, occurred_on: "2026-07-05", source: "salary" },
        { amount: 12000, occurred_on: "2026-06-05", source: "salary" },
      ],
      [
        { amount: 8000, occurred_on: "2026-07-20" },
        { amount: 9000, occurred_on: "2026-06-20" },
      ],
    );
    expect(points).toHaveLength(3);
    expect(points[2].month).toBe("2026-07-01");
    expect(points[2].income).toBe(12000);
    expect(points[2].expenses).toBe(8000);
    expect(points[2].net).toBe(4000);
    expect(points[1].net).toBe(3000);
    // The oldest month has no data at all.
    expect(points[0].net).toBe(0);
  });

  test("respects the billing-cycle start day", () => {
    // With startDay=10, the 5th of July belongs to June's budget month.
    const points = incomeVsExpenseTrend(
      "2026-07-01",
      2,
      [{ amount: 12000, occurred_on: "2026-07-05", source: "salary" }],
      [],
      10,
    );
    expect(points[0].month).toBe("2026-06-01");
    expect(points[0].income).toBe(12000);
    expect(points[1].income).toBe(0);
  });

  test("rows outside the window are ignored", () => {
    const points = incomeVsExpenseTrend(
      "2026-07-01",
      2,
      [{ amount: 99999, occurred_on: "2020-01-01", source: "salary" }],
      [],
    );
    expect(points.every((p) => p.income === 0)).toBe(true);
  });
});
