import { describe, expect, test } from "vitest";
import { detectRecurring, type RecurringTxn } from "./recurring";

const txns: RecurringTxn[] = [
  // Netflix in 3 months → recurring
  { merchant: "Netflix", amount: 32.9, occurred_on: "2026-05-02", category_id: "fun" },
  { merchant: "Netflix", amount: 32.9, occurred_on: "2026-06-02", category_id: "fun" },
  { merchant: "Netflix", amount: 45, occurred_on: "2026-07-02", category_id: "fun" },
  // Partner phone in 2 months → recurring
  { merchant: "פרטנר", amount: 129, occurred_on: "2026-06-10", category_id: "bills" },
  { merchant: "פרטנר", amount: 129, occurred_on: "2026-07-10", category_id: "bills" },
  // One-off → not recurring
  { merchant: "איקאה", amount: 640, occurred_on: "2026-06-18", category_id: "shop" },
  // Two charges same month → not recurring (only 1 distinct month)
  { merchant: "קפה", amount: 15, occurred_on: "2026-07-01", category_id: null },
  { merchant: "קפה", amount: 15, occurred_on: "2026-07-20", category_id: null },
];

describe("detectRecurring", () => {
  const items = detectRecurring(txns);

  test("keeps only merchants seen in 2+ distinct months", () => {
    const merchants = items.map((i) => i.merchant);
    expect(merchants).toContain("Netflix");
    expect(merchants).toContain("פרטנר");
    expect(merchants).not.toContain("איקאה");
    expect(merchants).not.toContain("קפה");
  });

  test("sorts by number of months, then computes median + total", () => {
    expect(items[0].merchant).toBe("Netflix"); // 3 months
    expect(items[0].months).toBe(3);
    expect(items[0].typicalAmount).toBe(32.9); // median of [32.9, 32.9, 45]
    expect(items[0].totalAmount).toBeCloseTo(110.8);
    expect(items[0].categoryId).toBe("fun");
    expect(items[0].lastDate).toBe("2026-07-02");
  });
});
