import { describe, expect, test } from "vitest";
import { suggestCategory, type NamedCategory } from "./categorize";

const categories: NamedCategory[] = [
  { id: "food", name: "מזון", kind: "expense" },
  { id: "fuel", name: "דלק", kind: "expense" },
  { id: "transport", name: "תחבורה", kind: "expense" },
  { id: "fun", name: "בילויים", kind: "expense" },
];
const categoriesByName = new Map(categories.map((c) => [c.name, c]));

describe("suggestCategory", () => {
  test("learned memory wins over everything", () => {
    const s = suggestCategory(
      { merchant: "rentalcars.com", rawCategory: "רכב ותחבורה" },
      { rules: [{ keyword: "rentalcars", category_id: "fun" }], categoriesByName },
    );
    expect(s).toEqual({ categoryId: "fun", source: "memory" });
  });

  test("bank industry maps to a category", () => {
    const s = suggestCategory(
      { merchant: "אטליז כלשהו", rawCategory: "מזון ומשקאות" },
      { rules: [], categoriesByName },
    );
    expect(s).toEqual({ categoryId: "food", source: "industry" });
  });

  test("falls back to merchant keyword when no industry", () => {
    const s = suggestCategory(
      { merchant: "תחנת דלק פז", rawCategory: null },
      { rules: [], categoriesByName },
    );
    expect(s).toEqual({ categoryId: "fuel", source: "keyword" });
  });

  test("unknown merchant → uncategorized", () => {
    const s = suggestCategory(
      { merchant: "עסק לא מוכר", rawCategory: null },
      { rules: [], categoriesByName },
    );
    expect(s).toEqual({ categoryId: null, source: "none" });
  });
});
