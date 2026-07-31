import { expect, test, describe } from "vitest";
import { summarizeNetWorth, monthsOfRunway } from "./summary";
import type { ValuedAccount, ValuedLiability } from "./value";

const asset = (over: Partial<ValuedAccount> = {}): ValuedAccount => ({
  id: "a",
  name: "נכס",
  kind: "cash",
  ownerProfileId: null,
  value: 1000,
  basis: "anchor",
  asOf: "2026-07-31",
  estimated: false,
  lastYieldPeriod: null,
  unpricedSymbols: [],
  returnRate: null,
  ...over,
});

const liability = (over: Partial<ValuedLiability> = {}): ValuedLiability => ({
  id: "l",
  name: "התחייבות",
  kind: "mortgage",
  ownerProfileId: null,
  balance: 500,
  basis: "computed",
  asOf: "2026-07-31",
  monthlyPayment: 10,
  monthsRemaining: 100,
  interestPaid: 0,
  ...over,
});

describe("summarizeNetWorth", () => {
  test("net worth is assets minus liabilities", () => {
    const s = summarizeNetWorth(
      [asset({ value: 100_000 }), asset({ id: "b", value: 50_000 })],
      [liability({ balance: 30_000 })],
    );
    expect(s.totalAssets).toBe(150_000);
    expect(s.totalLiabilities).toBe(30_000);
    expect(s.netWorth).toBe(120_000);
  });

  test("net worth can be negative", () => {
    const s = summarizeNetWorth(
      [asset({ value: 10_000 })],
      [liability({ balance: 900_000 })],
    );
    expect(s.netWorth).toBe(-890_000);
  });

  test("groups by kind, largest first, with shares summing to 1", () => {
    const s = summarizeNetWorth(
      [
        asset({ id: "1", kind: "pension", value: 300_000 }),
        asset({ id: "2", kind: "crypto", value: 100_000 }),
        asset({ id: "3", kind: "pension", value: 100_000 }),
      ],
      [],
    );
    expect(s.byKind.map((k) => k.kind)).toEqual(["pension", "crypto"]);
    expect(s.byKind[0].value).toBe(400_000);
    expect(s.byKind[0].label).toBe("פנסיה");
    expect(s.byKind.reduce((sum, k) => sum + k.share, 0)).toBeCloseTo(1, 6);
  });

  test("attributes assets and liabilities per partner", () => {
    const s = summarizeNetWorth(
      [
        asset({ id: "1", ownerProfileId: "vik", value: 200_000 }),
        asset({ id: "2", ownerProfileId: "partner", value: 150_000 }),
        asset({ id: "3", ownerProfileId: null, value: 50_000 }),
      ],
      [liability({ ownerProfileId: "vik", balance: 80_000 })],
    );
    const vik = s.byOwner.find((o) => o.ownerProfileId === "vik")!;
    expect(vik.assets).toBe(200_000);
    expect(vik.liabilities).toBe(80_000);
    expect(vik.net).toBe(120_000);

    const joint = s.byOwner.find((o) => o.ownerProfileId === null)!;
    expect(joint.net).toBe(50_000);

    // Per-owner nets must reconcile with the household total.
    expect(s.byOwner.reduce((sum, o) => sum + o.net, 0)).toBe(s.netWorth);
  });

  test("only cash, brokerage and crypto count as liquid", () => {
    const s = summarizeNetWorth(
      [
        asset({ id: "1", kind: "cash", value: 20_000 }),
        asset({ id: "2", kind: "brokerage", value: 30_000 }),
        asset({ id: "3", kind: "crypto", value: 10_000 }),
        asset({ id: "4", kind: "pension", value: 500_000 }),
        asset({ id: "5", kind: "hishtalmut", value: 200_000 }),
        asset({ id: "6", kind: "real_estate", value: 2_000_000 }),
      ],
      [],
    );
    expect(s.liquidAssets).toBe(60_000);
  });

  test("unvaluable accounts are counted, not treated as zero", () => {
    const s = summarizeNetWorth(
      [asset({ id: "1", value: 100 }), asset({ id: "2", value: null, basis: "none" })],
      [],
    );
    expect(s.totalAssets).toBe(100);
    expect(s.unvaluableCount).toBe(1);
  });

  test("flags when any figure is an estimate", () => {
    expect(summarizeNetWorth([asset()], []).hasEstimates).toBe(false);
    expect(
      summarizeNetWorth([asset({ estimated: true, basis: "drift" })], []).hasEstimates,
    ).toBe(true);
  });

  test("an empty household is all zeroes, not NaN", () => {
    const s = summarizeNetWorth([], []);
    expect(s.netWorth).toBe(0);
    expect(s.totalAssets).toBe(0);
    expect(s.byKind).toEqual([]);
    expect(Number.isNaN(s.netWorth)).toBe(false);
  });
});

describe("monthsOfRunway", () => {
  test("divides liquid assets by average monthly spend", () => {
    expect(monthsOfRunway(74_000, 10_000)).toBe(7.4);
  });

  test("returns null without a spending baseline", () => {
    expect(monthsOfRunway(50_000, 0)).toBeNull();
    expect(monthsOfRunway(50_000, -5)).toBeNull();
    expect(monthsOfRunway(50_000, Number.NaN)).toBeNull();
  });
});
