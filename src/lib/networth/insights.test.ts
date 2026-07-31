import { expect, test, describe } from "vitest";
import { generateNetWorthInsights } from "./insights";
import { summarizeNetWorth } from "./summary";
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
  name: "משכנתא",
  kind: "mortgage",
  ownerProfileId: null,
  balance: 500_000,
  basis: "computed",
  asOf: "2026-07-31",
  monthlyPayment: 5000,
  monthsRemaining: 150,
  interestPaid: 0,
  loanType: "spitzer",
  inGrace: false,
  balloonDue: null,
  rate: 4,
  ...over,
});

const base = {
  accounts: [] as ValuedAccount[],
  liabilities: [] as ValuedLiability[],
  prevNetWorth: null,
  avgMonthlyExpenses: null,
};

function run(over: Partial<Parameters<typeof generateNetWorthInsights>[0]>) {
  const accounts = over.accounts ?? base.accounts;
  const liabilities = over.liabilities ?? base.liabilities;
  return generateNetWorthInsights({
    ...base,
    ...over,
    accounts,
    liabilities,
    summary: over.summary ?? summarizeNetWorth(accounts, liabilities),
  });
}

describe("generateNetWorthInsights", () => {
  test("warns when liabilities exceed assets", () => {
    const ids = run({
      accounts: [asset({ value: 10_000 })],
      liabilities: [liability({ balance: 400_000 })],
    }).map((i) => i.id);
    expect(ids).toContain("negative-net-worth");
  });

  test("flags concentration in a single asset kind", () => {
    const insights = run({
      accounts: [
        asset({ id: "1", kind: "real_estate", value: 2_000_000 }),
        asset({ id: "2", kind: "cash", value: 100_000 }),
      ],
    });
    const c = insights.find((i) => i.id === "concentration");
    expect(c).toBeDefined();
    expect(c!.text).toContain("נדל");
  });

  test("does not flag concentration when there is only one kind", () => {
    const insights = run({ accounts: [asset({ kind: "cash", value: 5000 })] });
    expect(insights.find((i) => i.id === "concentration")).toBeUndefined();
  });

  test("surfaces the highest return", () => {
    const insights = run({
      accounts: [
        asset({ id: "1", name: "קרן השתלמות", returnRate: 0.082 }),
        asset({ id: "2", name: "תיק מסחר", returnRate: 0.031 }),
      ],
    });
    const best = insights.find((i) => i.id === "best-return");
    expect(best!.title).toContain("קרן השתלמות");
    expect(best!.text).toContain("8.2%");
  });

  test("reports the runway from real expense history", () => {
    const insights = run({
      accounts: [asset({ kind: "cash", value: 74_000 })],
      avgMonthlyExpenses: 10_000,
    });
    const runway = insights.find((i) => i.id === "runway");
    expect(runway!.text).toContain("7.4");
    expect(runway!.tone).toBe("success");
  });

  test("a thin runway is a warning", () => {
    const insights = run({
      accounts: [asset({ kind: "cash", value: 10_000 })],
      avgMonthlyExpenses: 10_000,
    });
    expect(insights.find((i) => i.id === "runway")!.tone).toBe("warning");
  });

  test("no runway insight without a spending baseline", () => {
    const insights = run({ accounts: [asset({ kind: "cash", value: 50_000 })] });
    expect(insights.find((i) => i.id === "runway")).toBeUndefined();
  });

  test("reports the month-over-month move", () => {
    const up = run({
      accounts: [asset({ value: 110_000 })],
      prevNetWorth: 100_000,
    }).find((i) => i.id === "net-worth-up");
    expect(up!.text).toContain("10%");

    const down = run({
      accounts: [asset({ value: 90_000 })],
      prevNetWorth: 100_000,
    }).find((i) => i.id === "net-worth-down");
    expect(down!.tone).toBe("warning");
  });

  test("flags an expensive fund", () => {
    const insights = run({
      accounts: [asset({ id: "acc1", name: "קופת גמל", kind: "gemel", value: 300_000 })],
      feeByAccountId: new Map([["acc1", 1.05]]),
    });
    const fee = insights.find((i) => i.id === "high-fee");
    expect(fee!.text).toContain("1.05%");
  });

  test("a cheap fund is not flagged", () => {
    const insights = run({
      accounts: [asset({ id: "acc1", kind: "gemel", value: 300_000 })],
      feeByAccountId: new Map([["acc1", 0.35]]),
    });
    expect(insights.find((i) => i.id === "high-fee")).toBeUndefined();
  });

  test("nudges about accounts with no value", () => {
    const insights = run({
      accounts: [asset({ id: "1", value: 100 }), asset({ id: "2", value: null })],
    });
    expect(insights.find((i) => i.id === "unvaluable")).toBeDefined();
  });

  test("an empty household produces no noise", () => {
    expect(run({})).toEqual([]);
  });

  test("the list is capped", () => {
    const insights = run({
      accounts: [
        asset({ id: "1", kind: "real_estate", value: 3_000_000, returnRate: 0.05 }),
        asset({ id: "2", kind: "cash", value: 10_000 }),
        asset({ id: "3", value: null }),
      ],
      liabilities: [liability()],
      prevNetWorth: 2_000_000,
      avgMonthlyExpenses: 8000,
      feeByAccountId: new Map([["1", 1.5]]),
    });
    expect(insights.length).toBeLessThanOrEqual(5);
  });
});
