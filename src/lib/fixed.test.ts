import { expect, test, describe } from "vitest";
import { groupFixedByCategory, type FixedTxn } from "./fixed";
import type { AggCategory } from "./aggregate";

const categories: AggCategory[] = [
  { id: "housing", name: "דיור", icon: null, color: null, kind: "expense" },
  { id: "media", name: "מנויים", icon: null, color: null, kind: "expense" },
];

const txn = (over: Partial<FixedTxn> = {}): FixedTxn => ({
  id: "t1",
  category_id: "housing",
  amount: 1000,
  occurred_on: "2026-07-01",
  description: null,
  merchant: null,
  is_fixed: true,
  ...over,
});

describe("groupFixedByCategory", () => {
  test("totals per category and overall", () => {
    const s = groupFixedByCategory(
      [
        txn({ id: "1", category_id: "housing", amount: 5000 }),
        txn({ id: "2", category_id: "media", amount: 50 }),
        txn({ id: "3", category_id: "media", amount: 30 }),
      ],
      categories,
    );
    expect(s.total).toBe(5080);
    expect(s.count).toBe(3);
    expect(s.groups).toHaveLength(2);
    expect(s.groups[0].category?.name).toBe("דיור");
    expect(s.groups[0].total).toBe(5000);
    expect(s.groups[1].total).toBe(80);
    expect(s.groups[1].count).toBe(2);
  });

  test("sorts categories by total, largest first", () => {
    const s = groupFixedByCategory(
      [
        txn({ id: "1", category_id: "media", amount: 200 }),
        txn({ id: "2", category_id: "housing", amount: 100 }),
      ],
      categories,
    );
    expect(s.groups.map((g) => g.category?.id)).toEqual(["media", "housing"]);
  });

  test("uncategorized collects under null and sorts last", () => {
    const s = groupFixedByCategory(
      [
        txn({ id: "1", category_id: null, amount: 9999 }),
        txn({ id: "2", category_id: "media", amount: 50 }),
      ],
      categories,
    );
    // Even though it's the biggest, the uncategorized group goes last.
    expect(s.groups[s.groups.length - 1].category).toBeNull();
    expect(s.groups[s.groups.length - 1].total).toBe(9999);
    expect(s.total).toBe(10049);
  });

  test("a category that no longer exists falls in with the uncategorized", () => {
    const s = groupFixedByCategory(
      [txn({ id: "1", category_id: "deleted-category", amount: 300 })],
      categories,
    );
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].category).toBeNull();
    expect(s.groups[0].total).toBe(300);
  });

  test("items within a group are newest first", () => {
    const s = groupFixedByCategory(
      [
        txn({ id: "old", occurred_on: "2026-05-01" }),
        txn({ id: "new", occurred_on: "2026-07-01" }),
        txn({ id: "mid", occurred_on: "2026-06-01" }),
      ],
      categories,
    );
    expect(s.groups[0].items.map((i) => i.id)).toEqual(["new", "mid", "old"]);
  });

  test("explicitly unflagged rows are excluded", () => {
    const s = groupFixedByCategory(
      [txn({ id: "1", amount: 100 }), txn({ id: "2", amount: 500, is_fixed: false })],
      categories,
    );
    expect(s.total).toBe(100);
    expect(s.count).toBe(1);
  });

  test("nothing flagged is an empty summary, not NaN", () => {
    const s = groupFixedByCategory([], categories);
    expect(s.total).toBe(0);
    expect(s.count).toBe(0);
    expect(s.groups).toEqual([]);
  });
});
