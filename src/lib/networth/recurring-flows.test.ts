import { expect, test, describe } from "vitest";
import {
  expandRecurringFlow,
  allFlows,
  netContributed,
  type RecurringFlowRule,
} from "./recurring-flows";

const rule = (over: Partial<RecurringFlowRule> = {}): RecurringFlowRule => ({
  amount: 2000,
  day_of_month: 10,
  start_month: "2026-01-01",
  end_month: null,
  ...over,
});

describe("expandRecurringFlow", () => {
  test("one flow per month up to today", () => {
    const flows = expandRecurringFlow(rule(), "2026-04-30");
    expect(flows).toHaveLength(4);
    expect(flows[0].occurred_on).toBe("2026-01-10");
    expect(flows[3].occurred_on).toBe("2026-04-10");
    expect(flows.every((f) => f.amount === 2000)).toBe(true);
  });

  test("a deposit dated later this month hasn't happened yet", () => {
    // Today is the 5th; the 10th is still to come.
    const flows = expandRecurringFlow(rule(), "2026-03-05");
    expect(flows).toHaveLength(2);
    expect(flows[flows.length - 1].occurred_on).toBe("2026-02-10");
  });

  test("stops at the rule's end date", () => {
    const flows = expandRecurringFlow(
      rule({ end_month: "2026-02-01" }),
      "2026-12-31",
    );
    expect(flows).toHaveLength(2);
    expect(flows[1].occurred_on).toBe("2026-02-10");
  });

  test("rolls over the year boundary", () => {
    const flows = expandRecurringFlow(
      rule({ start_month: "2025-11-01" }),
      "2026-02-28",
    );
    expect(flows.map((f) => f.occurred_on)).toEqual([
      "2025-11-10",
      "2025-12-10",
      "2026-01-10",
      "2026-02-10",
    ]);
  });

  test("a rule that hasn't started yet produces nothing", () => {
    expect(expandRecurringFlow(rule({ start_month: "2027-01-01" }), "2026-07-31"))
      .toEqual([]);
  });

  test("the day is clamped so it exists in every month", () => {
    const flows = expandRecurringFlow(
      rule({ day_of_month: 31, start_month: "2026-02-01" }),
      "2026-02-28",
    );
    expect(flows[0].occurred_on).toBe("2026-02-28");
  });

  test("withdrawals expand too", () => {
    const flows = expandRecurringFlow(rule({ amount: -500 }), "2026-02-28");
    expect(flows.every((f) => f.amount === -500)).toBe(true);
  });

  test("a zero or malformed rule yields nothing rather than looping", () => {
    expect(expandRecurringFlow(rule({ amount: 0 }), "2026-12-31")).toEqual([]);
    expect(
      expandRecurringFlow(rule({ start_month: "nonsense" }), "2026-12-31"),
    ).toEqual([]);
  });

  test("a very old rule is bounded, not unbounded", () => {
    const flows = expandRecurringFlow(
      rule({ start_month: "1900-01-01" }),
      "2026-07-31",
    );
    expect(flows.length).toBeLessThanOrEqual(600);
    expect(flows.length).toBeGreaterThan(0);
  });
});

describe("allFlows", () => {
  test("merges one-off entries with expanded rules, oldest first", () => {
    const flows = allFlows(
      [{ occurred_on: "2026-02-20", amount: 10_000 }],
      [rule({ start_month: "2026-01-01" })],
      "2026-03-31",
    );
    expect(flows.map((f) => f.occurred_on)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-02-20",
      "2026-03-10",
    ]);
  });

  test("works with no rules at all", () => {
    const oneOff = [{ occurred_on: "2026-01-01", amount: 500 }];
    expect(allFlows(oneOff, [], "2026-07-31")).toEqual(oneOff);
  });
});

describe("netContributed", () => {
  test("deposits minus withdrawals", () => {
    expect(
      netContributed([
        { occurred_on: "2026-01-01", amount: 2000 },
        { occurred_on: "2026-02-01", amount: 2000 },
        { occurred_on: "2026-03-01", amount: -500 },
      ]),
    ).toBe(3500);
  });

  test("nothing contributed is zero, not NaN", () => {
    expect(netContributed([])).toBe(0);
  });
});
