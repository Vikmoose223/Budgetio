import { expect, test, describe } from "vitest";
import {
  levelPayment,
  loanState,
  monthsBetween,
  effectiveRate,
} from "./amortization";

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

describe("effectiveRate", () => {
  test("a fixed loan uses its own rate", () => {
    expect(effectiveRate("fixed", 4.5, 5, 1)).toBe(4.5);
  });

  test("prime plus a margin", () => {
    expect(effectiveRate("prime", 0, 5, 1.2)).toBeCloseTo(6.2, 6);
  });

  test("prime minus a margin (פריים מינוס)", () => {
    expect(effectiveRate("prime", 0, 5, -0.5)).toBeCloseTo(4.5, 6);
  });

  test("a negative margin can't drive the rate below zero", () => {
    expect(effectiveRate("prime", 0, 1, -5)).toBe(0);
  });
});

describe("loanState — loan types", () => {
  const base = {
    principal: 100_000,
    annualRate: 6,
    termMonths: 60,
    startDate: "2026-01-01",
  };

  describe("none — a debt with no repayment schedule", () => {
    const debt = { ...base, loanType: "none" as const, annualRate: 0 };

    test("the balance never moves on its own", () => {
      expect(loanState(debt, "2026-01-01").balance).toBe(100_000);
      expect(loanState(debt, "2030-01-01").balance).toBe(100_000);
    });

    test("there is no monthly payment and nothing accrues", () => {
      const s = loanState(debt, "2027-06-01");
      expect(s.payment).toBe(0);
      expect(s.interestPaid).toBe(0);
      expect(s.principalPaid).toBe(0);
      expect(s.balloonDue).toBeNull();
    });

    test("a stated interest rate is still ignored — there's no schedule", () => {
      const withRate = loanState({ ...debt, annualRate: 10 }, "2030-01-01");
      expect(withRate.balance).toBe(100_000);
    });
  });

  describe("balloon — everything due at the end", () => {
    test("partial balloon: interest paid monthly, principal untouched", () => {
      const s = loanState(
        { ...base, loanType: "balloon", capitalizeInterest: false },
        "2027-01-01",
      );
      expect(s.balance).toBeCloseTo(100_000, 2);
      // 6%/yr on 100k = ₪500/month.
      expect(s.payment).toBeCloseTo(500, 2);
      expect(s.interestPaid).toBeCloseTo(6000, 0);
      expect(s.principalPaid).toBe(0);
      expect(s.balloonDue).toBeCloseTo(100_000, 2);
    });

    test("full balloon: interest capitalizes, nothing is paid", () => {
      const s = loanState(
        { ...base, loanType: "balloon", capitalizeInterest: true },
        "2027-01-01",
      );
      // 100,000 × (1 + 0.06/12)^12
      expect(s.balance).toBeCloseTo(106_167.78, 0);
      expect(s.payment).toBe(0);
      expect(s.interestPaid).toBe(0);
      // The lump due at maturity covers the full compounded term.
      expect(s.balloonDue).toBeCloseTo(100_000 * Math.pow(1.005, 60), 0);
    });

    test("a balloon stays in grace for its whole term", () => {
      expect(loanState({ ...base, loanType: "balloon" }, "2029-01-01").inGrace).toBe(
        true,
      );
    });
  });

  describe("grace — deferred principal, then שפיצר", () => {
    const grace = {
      ...base,
      loanType: "grace" as const,
      graceMonths: 12,
    };

    test("during partial grace only interest is paid", () => {
      const s = loanState({ ...grace, capitalizeInterest: false }, "2026-07-01");
      expect(s.balance).toBeCloseTo(100_000, 2);
      expect(s.principalPaid).toBe(0);
      expect(s.inGrace).toBe(true);
      expect(s.payment).toBeCloseTo(500, 2);
    });

    test("during full grace the balance grows", () => {
      const s = loanState({ ...grace, capitalizeInterest: true }, "2026-07-01");
      expect(s.balance).toBeGreaterThan(100_000);
      expect(s.payment).toBe(0);
    });

    test("principal starts falling once grace ends", () => {
      const atGraceEnd = loanState(grace, "2027-01-01");
      const later = loanState(grace, "2028-01-01");
      expect(atGraceEnd.principalPaid).toBe(0);
      expect(later.principalPaid).toBeGreaterThan(0);
      expect(later.balance).toBeLessThan(atGraceEnd.balance);
      expect(later.inGrace).toBe(false);
    });

    test("it still clears by the end of the full term", () => {
      const s = loanState(grace, "2031-01-01");
      expect(s.balance).toBeCloseTo(0, 1);
    });

    test("the post-grace payment is higher than plain שפיצר would be", () => {
      // The same principal repaid over 48 months instead of 60.
      const gracePayment = loanState(grace, "2027-06-01").payment;
      const spitzerPayment = loanState(
        { ...base, loanType: "spitzer" },
        "2027-06-01",
      ).payment;
      expect(gracePayment).toBeGreaterThan(spitzerPayment);
    });

    test("zero grace months behaves exactly like שפיצר", () => {
      const a = loanState({ ...grace, graceMonths: 0 }, "2028-01-01");
      const b = loanState({ ...base, loanType: "spitzer" }, "2028-01-01");
      expect(a.balance).toBeCloseTo(b.balance, 2);
    });

    test("grace longer than the term is clamped, not allowed to invert it", () => {
      const s = loanState({ ...grace, graceMonths: 999 }, "2028-01-01");
      expect(Number.isFinite(s.balance)).toBe(true);
      expect(s.balance).toBeGreaterThan(0);
    });
  });

  test("spitzer stays the default when no type is given", () => {
    const explicit = loanState({ ...base, loanType: "spitzer" }, "2027-01-01");
    const implicit = loanState(base, "2027-01-01");
    expect(implicit.balance).toBeCloseTo(explicit.balance, 6);
  });
});
