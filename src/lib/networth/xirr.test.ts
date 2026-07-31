import { expect, test, describe } from "vitest";
import { xirr, accountReturn } from "./xirr";

describe("xirr", () => {
  test("a simple doubling over one year is ~100%", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 2000 },
    ]);
    expect(rate).toBeCloseTo(1.0, 4);
  });

  test("10% over exactly one year", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(rate).toBeCloseTo(0.1, 4);
  });

  test("solves an uneven multi-flow schedule", () => {
    // Root verified independently by bisection on
    // NPV(r) = -10000 - 5000/(1+r)^(182/365) + 20000/(1+r)^(731/365).
    const rate = xirr([
      { date: "2024-01-01", amount: -10000 },
      { date: "2024-07-01", amount: -5000 },
      { date: "2026-01-01", amount: 20000 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.169154, 5);
  });

  test("the returned rate actually zeroes the NPV", () => {
    // Property check: whatever root we find must satisfy the defining equation.
    const flows = [
      { date: "2023-03-15", amount: -25000 },
      { date: "2024-01-10", amount: -4000 },
      { date: "2025-06-30", amount: 3000 },
      { date: "2026-07-31", amount: 32000 },
    ];
    const rate = xirr(flows)!;
    expect(rate).not.toBeNull();
    const t0 = Date.UTC(2023, 2, 15);
    const npv = flows.reduce((sum, f) => {
      const [y, m, d] = f.date.split("-").map(Number);
      const years = (Date.UTC(y, m - 1, d) - t0) / 86_400_000 / 365;
      return sum + f.amount / Math.pow(1 + rate, years);
    }, 0);
    expect(Math.abs(npv)).toBeLessThan(0.01);
  });

  test("a loss produces a negative rate", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 800 },
    ]);
    expect(rate).toBeCloseTo(-0.2, 4);
  });

  test("sub-year holding periods are annualised", () => {
    // +5% in roughly half a year annualises to well above 5%.
    const rate = xirr([
      { date: "2026-01-01", amount: -1000 },
      { date: "2026-07-01", amount: 1050 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0.09);
    expect(rate!).toBeLessThan(0.11);
  });

  test("order of the flows does not matter", () => {
    const a = xirr([
      { date: "2026-01-01", amount: 20000 },
      { date: "2024-01-01", amount: -10000 },
      { date: "2024-07-01", amount: -5000 },
    ]);
    const b = xirr([
      { date: "2024-01-01", amount: -10000 },
      { date: "2024-07-01", amount: -5000 },
      { date: "2026-01-01", amount: 20000 },
    ]);
    expect(a).toBeCloseTo(b!, 6);
  });

  test("returns null rather than a wrong number when undefined", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2026-01-01", amount: -100 }])).toBeNull();
    // All outflows: no rate can be implied.
    expect(
      xirr([
        { date: "2025-01-01", amount: -100 },
        { date: "2026-01-01", amount: -100 },
      ]),
    ).toBeNull();
  });

  test("survives a near-total loss without diverging", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(-0.99);
    expect(Number.isFinite(rate!)).toBe(true);
  });
});

describe("accountReturn", () => {
  test("deposits are negated into XIRR's sign convention", () => {
    // ₪1,000 deposited a year ago, worth ₪1,100 now → 10%.
    const rate = accountReturn(
      [{ occurred_on: "2025-07-31", amount: 1000 }],
      1100,
      "2026-07-31",
    );
    expect(rate).toBeCloseTo(0.1, 3);
  });

  test("monthly pension contributions are not counted as gains", () => {
    // 12 × ₪1,000 deposited monthly, now worth exactly ₪12,000 → no gain.
    const flows = Array.from({ length: 12 }, (_, i) => ({
      occurred_on: `2025-${String(i + 1).padStart(2, "0")}-01`,
      amount: 1000,
    }));
    const rate = accountReturn(flows, 12000, "2026-01-01");
    expect(rate).not.toBeNull();
    expect(Math.abs(rate!)).toBeLessThan(0.01);
  });

  test("no flows means no computable return", () => {
    expect(accountReturn([], 5000, "2026-07-31")).toBeNull();
  });
});
