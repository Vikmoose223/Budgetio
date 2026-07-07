import { expect, test, describe } from "vitest";
import { formatILS, firstOfMonthISO, monthLabel } from "./format";

describe("formatILS", () => {
  test("formats whole shekels with the ₪ sign", () => {
    expect(formatILS(1234)).toContain("₪");
    expect(formatILS(1234)).toContain("1,234");
  });

  test("rounds to whole shekels by default", () => {
    expect(formatILS(1234.6)).toContain("1,235");
  });

  test("precise mode keeps two decimals", () => {
    expect(formatILS(12.5, { precise: true })).toContain("12.50");
  });

  test("guards against NaN", () => {
    expect(formatILS(NaN)).toContain("0");
  });
});

describe("firstOfMonthISO", () => {
  test("returns the first day of the month", () => {
    expect(firstOfMonthISO(new Date(2026, 6, 15))).toBe("2026-07-01");
  });

  test("zero-pads single-digit months", () => {
    expect(firstOfMonthISO(new Date(2026, 0, 3))).toBe("2026-01-01");
  });
});

describe("monthLabel", () => {
  test("renders a Hebrew month + year", () => {
    const label = monthLabel("2026-07-01");
    expect(label).toContain("2026");
    expect(label).toMatch(/יולי/);
  });
});
