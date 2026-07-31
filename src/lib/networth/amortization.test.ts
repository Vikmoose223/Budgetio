import { expect, test, describe } from "vitest";
import { levelPayment, loanState, monthsBetween } from "./amortization";

describe("monthsBetween", () => {
  test("counts whole months only", () => {
    expect(monthsBetween("2026-01-15", "2026-07-15")).toBe(6);
    // One day short of the sixth month.
    expect(monthsBetween("2026-01-15", "2026-07-14")).toBe(5);
    expect(monthsBetween("2025-12-01", "2026-03-01")).toBe(3);
  });

  test("never goes negative", () => {
    expect(monthsBetween("2026-07-01", "2026-01-01")).toBe(0);
  });
});

describe("levelPayment", () => {
  test("matches the standard annuity formula", () => {
    // ₪1,000,000 at 5% over 30 years ≈ ₪5,368.22/month.
    expect(levelPayment(1_000_000, 5, 360)).toBeCloseTo(5368.22, 1);
  });

  test("a zero-rate loan is straight-line", () => {
    expect(levelPayment(120_000, 0, 120)).toBeCloseTo(1000, 6);
  });
});

describe("loanState", () => {
  const mortgage = {
    principal: 1_000_000,
    annualRate: 5,
    termMonths: 360,
    startDate: "2020-01-01",
  };

  test("the balance is untouched on day one", () => {
    const state = loanState(mortgage, "2020-01-01");
    expect(state.balance).toBeCloseTo(1_000_000, 0);
    expect(state.monthsElapsed).toBe(0);
    expect(state.monthsRemaining).toBe(360);
  });

  test("early payments are mostly interest", () => {
    const state = loanState(mortgage, "2021-01-01");
    // After 12 payments only ~₪14.5k of a ₪1M mortgage is repaid.
    expect(state.principalPaid).toBeGreaterThan(10_000);
    expect(state.principalPaid).toBeLessThan(20_000);
    // …while interest paid is far larger.
    expect(state.interestPaid).toBeGreaterThan(state.principalPaid * 2);
  });

  test("the loan is fully repaid at the end of its term", () => {
    const state = loanState(mortgage, "2050-01-01");
    expect(state.balance).toBeCloseTo(0, 1);
    expect(state.monthsRemaining).toBe(0);
  });

  test("the balance never goes below zero past the term", () => {
    const state = loanState(mortgage, "2060-01-01");
    expect(state.balance).toBe(0);
  });

  test("a zero-interest loan amortises straight-line", () => {
    const state = loanState(
      { principal: 120_000, annualRate: 0, termMonths: 120, startDate: "2026-01-01" },
      "2027-01-01",
    );
    expect(state.balance).toBeCloseTo(108_000, 2);
    expect(state.interestPaid).toBeCloseTo(0, 6);
  });

  test("a custom payment amount overrides the computed one", () => {
    const faster = loanState({ ...mortgage, paymentAmount: 8000 }, "2021-01-01");
    const normal = loanState(mortgage, "2021-01-01");
    // Paying more clears principal faster.
    expect(faster.balance).toBeLessThan(normal.balance);
    expect(faster.payment).toBe(8000);
  });

  test("CPI linkage inflates the outstanding balance", () => {
    const unlinked = loanState(mortgage, "2026-01-01");
    const linked = loanState(
      { ...mortgage, linkage: "cpi" },
      "2026-01-01",
      1.15, // index rose 15% since the loan started
    );
    expect(linked.balance).toBeCloseTo(unlinked.balance * 1.15, 1);
  });

  test("CPI linkage is ignored when the loan is not linked", () => {
    const state = loanState({ ...mortgage, linkage: "none" }, "2026-01-01", 1.15);
    const plain = loanState(mortgage, "2026-01-01");
    expect(state.balance).toBeCloseTo(plain.balance, 6);
  });
});
