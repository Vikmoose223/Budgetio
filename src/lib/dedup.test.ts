import { describe, expect, test } from "vitest";
import {
  normalizeName,
  sameAmount,
  isDuplicate,
  findDuplicates,
  type DupExisting,
} from "./dedup";

const existing = (over: Partial<DupExisting> = {}): DupExisting => ({
  id: "x1",
  occurred_on: "2026-07-10",
  amount: 120,
  merchant: "שופרסל",
  description: null,
  ...over,
});

describe("normalizeName", () => {
  test("trims, collapses whitespace, case-folds", () => {
    expect(normalizeName("  Super   Pharm  ")).toBe("super pharm");
  });
  test("null/undefined → empty", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("sameAmount", () => {
  test("equal to the agora", () => {
    expect(sameAmount(120, 120.0)).toBe(true);
    expect(sameAmount(120.001, 120.0)).toBe(true); // float noise
    expect(sameAmount(120, 120.5)).toBe(false);
  });
});

describe("isDuplicate", () => {
  const cand = { occurredOn: "2026-07-10", amount: 120, name: "שופרסל" };

  test("matches on exact name + date + amount", () => {
    expect(isDuplicate(cand, existing())).toBe(true);
  });
  test("name compare ignores case and whitespace", () => {
    expect(isDuplicate(cand, existing({ merchant: "  שופרסל " }))).toBe(true);
  });
  test("falls back to description when merchant is empty", () => {
    expect(
      isDuplicate(cand, existing({ merchant: null, description: "שופרסל" })),
    ).toBe(true);
  });
  test("different date is not a duplicate", () => {
    expect(isDuplicate(cand, existing({ occurred_on: "2026-07-11" }))).toBe(
      false,
    );
  });
  test("different amount is not a duplicate", () => {
    expect(isDuplicate(cand, existing({ amount: 121 }))).toBe(false);
  });
  test("different name is not a duplicate", () => {
    expect(isDuplicate(cand, existing({ merchant: "רמי לוי" }))).toBe(false);
  });
  test("empty candidate name never matches", () => {
    expect(
      isDuplicate({ ...cand, name: "  " }, existing({ merchant: "", description: "" })),
    ).toBe(false);
  });
});

describe("findDuplicates", () => {
  test("returns every matching existing row", () => {
    const cand = { occurredOn: "2026-07-10", amount: 120, name: "שופרסל" };
    const rows = [
      existing({ id: "a" }),
      existing({ id: "b", amount: 99 }),
      existing({ id: "c", merchant: "שופרסל" }),
    ];
    expect(findDuplicates(cand, rows).map((r) => r.id)).toEqual(["a", "c"]);
  });
});
