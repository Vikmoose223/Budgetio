import { expect, test, describe } from "vitest";
import {
  formatILS,
  firstOfMonthISO,
  monthLabel,
  formatDate,
  todayISO,
  periodRange,
  budgetMonthOf,
} from "./format";

describe("periodRange / budgetMonthOf (billing cycle)", () => {
  test("startDay=1 behaves like a calendar month", () => {
    expect(periodRange("2026-07-01", 1)).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-08-01",
    });
    expect(budgetMonthOf("2026-07-08", 1)).toBe("2026-07-01");
  });

  test("a billing start day shifts the period", () => {
    expect(periodRange("2026-06-01", 10)).toEqual({
      start: "2026-06-10",
      endExclusive: "2026-07-10",
    });
    // Before the 10th → the day belongs to the previous month's budget period.
    expect(budgetMonthOf("2026-07-08", 10)).toBe("2026-06-01");
    // On/after the 10th → the current month's period.
    expect(budgetMonthOf("2026-07-15", 10)).toBe("2026-07-01");
  });
});

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

describe("formatDate", () => {
  test("renders a Hebrew day + month", () => {
    expect(formatDate("2026-07-07")).toMatch(/יולי/);
    expect(formatDate("2026-07-07")).toContain("7");
  });
});

describe("todayISO", () => {
  test("returns a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
