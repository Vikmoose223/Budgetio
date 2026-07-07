import { describe, expect, test } from "vitest";
import {
  summarizeMonth,
  monthlyExpenseTrend,
  type AggCategory,
  type AggTxn,
} from "./aggregate";

const cats: AggCategory[] = [
  { id: "food", name: "מזון", icon: null, color: null, kind: "expense" },
  { id: "rent", name: "דיור", icon: null, color: null, kind: "expense" },
  { id: "save", name: "חיסכון", icon: null, color: null, kind: "saving" },
];

describe("summarizeMonth", () => {
  const txns: AggTxn[] = [
    { category_id: "food", amount: 100, occurred_on: "2026-07-03" },
    { category_id: "food", amount: 50, occurred_on: "2026-07-10" },
    { category_id: "save", amount: 200, occurred_on: "2026-07-01" },
    { category_id: null, amount: 999, occurred_on: "2026-07-01" }, // uncategorized: ignored per-category
  ];
  const goals = new Map([
    ["food", 400],
    ["rent", 3000],
    ["save", 500],
  ]);

  test("sums spending per category and keeps category order", () => {
    const s = summarizeMonth(cats, txns, goals);
    expect(s.perCategory.map((c) => c.category.id)).toEqual([
      "food",
      "rent",
      "save",
    ]);
    expect(s.perCategory[0]).toMatchObject({ spent: 150, goal: 400 });
    expect(s.perCategory[1]).toMatchObject({ spent: 0, goal: 3000 });
  });

  test("splits expense vs saving totals", () => {
    const s = summarizeMonth(cats, txns, goals);
    expect(s.totalExpenseSpent).toBe(150);
    expect(s.totalExpenseGoal).toBe(3400);
    expect(s.totalSavingSpent).toBe(200);
    expect(s.totalSavingGoal).toBe(500);
  });
});

describe("monthlyExpenseTrend", () => {
  const txns: AggTxn[] = [
    { category_id: "food", amount: 100, occurred_on: "2026-06-15" },
    { category_id: "food", amount: 80, occurred_on: "2026-07-02" },
    { category_id: "save", amount: 500, occurred_on: "2026-07-02" }, // saving excluded
  ];

  test("buckets expense spending by month, excluding savings", () => {
    const trend = monthlyExpenseTrend("2026-07-01", 3, cats, txns);
    expect(trend.map((p) => p.month)).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);
    expect(trend.map((p) => p.total)).toEqual([0, 100, 80]);
  });
});
