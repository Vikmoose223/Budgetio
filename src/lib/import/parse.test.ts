import { describe, expect, test } from "vitest";
import { parseRows, parseAmount, parseDate, externalId } from "./parse";

describe("parseAmount", () => {
  test("strips ₪, spaces and thousands separators", () => {
    expect(parseAmount("₪ 1,256.00")).toBe(1256);
    expect(parseAmount("₪ 17.68")).toBe(17.68);
  });
  test("empty / invalid → null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("—")).toBeNull();
  });
});

describe("parseDate", () => {
  test("day-first short and long years", () => {
    expect(parseDate("7/7/26")).toBe("2026-07-07");
    expect(parseDate("30/06/2026")).toBe("2026-06-30");
  });
  test("rejects impossible dates", () => {
    expect(parseDate("31/02/26")).toBeNull();
    expect(parseDate("hello")).toBeNull();
  });
});

// Mirrors the real Discount Visa export: title/summary rows, header on row 4,
// data rows, then a footer row without a date.
const matrix: unknown[][] = [
  ["פירוט עסקאות לחשבון דיסקונט"],
  [],
  ["עסקאות לחיוב ב-10/07/2026: 5,101"],
  ["עסקאות בתהליך קליטה 17.68 ₪"],
  ["תאריך\r\nעסקה", "שם בית עסק", "סכום\r\nעסקה", "סכום\r\nחיוב", "סוג\r\nעסקה", "ענף", "הערות"],
  ["7/7/26", "עילא חנות אוכל", "₪ 17.68", "", "רכישה רגילה", "מזון ומשקאות", "עסקה בקליטה"],
  ["4/7/26", "דלק מנטה מסמיה", "₪ 187.95", "₪ 187.95", "רגילה", "אנרגיה", ""],
  ["29/6/26", "rentalcars.com", "₪ 1,256.00", "₪ 1,256.00", "רגילה", "רכב ותחבורה", ""],
  ["סה\"כ", "", "", "₪ 1,461.63"],
];

describe("parseRows", () => {
  const parsed = parseRows(matrix);

  test("detects the header row and columns", () => {
    expect(parsed.headerRow).toBe(4);
    expect(parsed.columns.merchant).toBe(1);
    expect(parsed.columns.industry).toBe(5);
  });

  test("reads only real data rows, skipping the footer", () => {
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.skipped).toBe(1);
  });

  test("uses charge amount, falling back to transaction amount when empty", () => {
    expect(parsed.rows[0]).toMatchObject({
      occurredOn: "2026-07-07",
      merchant: "עילא חנות אוכל",
      amount: 17.68, // charge empty → transaction amount
      rawCategory: "מזון ומשקאות",
    });
    expect(parsed.rows[1].amount).toBe(187.95);
    expect(parsed.rows[2].amount).toBe(1256);
  });

  test("throws a friendly error when no header is found", () => {
    expect(() => parseRows([["foo", "bar"], ["1", "2"]])).toThrow();
  });
});

describe("externalId", () => {
  test("is stable for the same row content", () => {
    const [a] = parseRows(matrix).rows;
    expect(externalId(a)).toBe(externalId({ ...a }));
  });
});
