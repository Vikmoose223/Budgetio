import { expect, test, describe } from "vitest";
import {
  compareTo,
  compareAccounts,
  snapshotAt,
  monthsAgo,
  daysUntilComparable,
} from "./compare";

const snapshots = [
  { as_of: "2026-05-31", value: 100_000 },
  { as_of: "2026-06-30", value: 110_000 },
  { as_of: "2026-07-15", value: 115_000 },
];

describe("snapshotAt", () => {
  test("takes the latest point at or before the date", () => {
    expect(snapshotAt(snapshots, "2026-07-01")?.as_of).toBe("2026-06-30");
    expect(snapshotAt(snapshots, "2026-06-30")?.as_of).toBe("2026-06-30");
  });

  test("never reaches forward past the date", () => {
    // Using 2026-05-31 for an April baseline would shorten the period and
    // flatter the result, so it must return nothing instead.
    expect(snapshotAt(snapshots, "2026-04-01")).toBeNull();
  });
});

describe("compareTo", () => {
  test("computes the change against the baseline", () => {
    const d = compareTo(120_000, snapshots, "2026-06-30");
    expect(d.previous).toBe(110_000);
    expect(d.change).toBe(10_000);
    expect(d.changePct).toBeCloseTo(0.0909, 3);
    expect(d.baselineDate).toBe("2026-06-30");
  });

  test("reports the snapshot actually used, not the one requested", () => {
    const d = compareTo(120_000, snapshots, "2026-07-10");
    expect(d.baselineDate).toBe("2026-06-30");
  });

  test("a fall is negative", () => {
    const d = compareTo(90_000, snapshots, "2026-06-30");
    expect(d.change).toBe(-20_000);
    expect(d.changePct).toBeCloseTo(-0.1818, 3);
  });

  test("no baseline yields nulls rather than a fabricated comparison", () => {
    const d = compareTo(120_000, [], "2026-06-30");
    expect(d.current).toBe(120_000);
    expect(d.previous).toBeNull();
    expect(d.change).toBeNull();
    expect(d.baselineDate).toBeNull();
  });

  test("a zero baseline gives no percentage rather than Infinity", () => {
    const d = compareTo(500, [{ as_of: "2026-01-01", value: 0 }], "2026-06-30");
    expect(d.change).toBe(500);
    expect(d.changePct).toBeNull();
  });

  test("percentages stay meaningful when the baseline was negative", () => {
    const d = compareTo(
      -50,
      [{ as_of: "2026-01-01", value: -100 }],
      "2026-06-30",
    );
    // Debt halved: a rise of 50 against a magnitude of 100.
    expect(d.change).toBe(50);
    expect(d.changePct).toBeCloseTo(0.5, 6);
  });
});

describe("compareAccounts", () => {
  const accountSnaps = [
    { account_id: "a", as_of: "2026-06-30", value: 50_000 },
    { account_id: "b", as_of: "2026-06-30", value: 10_000 },
  ];

  test("compares each account against its own history", () => {
    const deltas = compareAccounts(
      [
        { id: "a", value: 55_000 },
        { id: "b", value: 9_000 },
      ],
      accountSnaps,
      "2026-06-30",
    );
    expect(deltas.find((d) => d.accountId === "a")!.change).toBe(5000);
    expect(deltas.find((d) => d.accountId === "b")!.change).toBe(-1000);
  });

  test("biggest mover first, in either direction", () => {
    const deltas = compareAccounts(
      [
        { id: "a", value: 51_000 },
        { id: "b", value: 2_000 },
      ],
      accountSnaps,
      "2026-06-30",
    );
    // b moved -8,000, a moved +1,000 — magnitude wins.
    expect(deltas[0].accountId).toBe("b");
  });

  test("an account with no history still appears, without a change", () => {
    const deltas = compareAccounts(
      [{ id: "new", value: 1000 }],
      accountSnaps,
      "2026-06-30",
    );
    expect(deltas[0].change).toBeNull();
    expect(deltas[0].current).toBe(1000);
  });

  test("unvaluable accounts are excluded rather than counted as zero", () => {
    const deltas = compareAccounts(
      [{ id: "x", value: null }],
      accountSnaps,
      "2026-06-30",
    );
    expect(deltas).toEqual([]);
  });
});

describe("monthsAgo", () => {
  test("steps back whole months", () => {
    expect(monthsAgo("2026-07-31", 1)).toBe("2026-06-30");
    expect(monthsAgo("2026-07-15", 1)).toBe("2026-06-15");
  });

  test("clamps the day so it can't overflow into the wrong month", () => {
    // 31 March minus one month is 28 February, not 3 March.
    expect(monthsAgo("2026-03-31", 1)).toBe("2026-02-28");
  });

  test("crosses the year boundary", () => {
    expect(monthsAgo("2026-01-15", 1)).toBe("2025-12-15");
    expect(monthsAgo("2026-01-15", 12)).toBe("2025-01-15");
  });

  test("a negative lookback steps forward", () => {
    expect(monthsAgo("2026-01-15", -1)).toBe("2026-02-15");
  });
});

describe("daysUntilComparable", () => {
  test("null once a usable baseline exists", () => {
    expect(daysUntilComparable(snapshots, "2026-07-31", 1)).toBeNull();
  });

  test("counts the days until the first snapshot is old enough", () => {
    const days = daysUntilComparable(
      [{ as_of: "2026-07-20", value: 1000 }],
      "2026-07-31",
      1,
    );
    // The 20 July point becomes a one-month baseline on 20 August.
    expect(days).toBe(20);
  });

  test("null when nothing has been recorded at all", () => {
    expect(daysUntilComparable([], "2026-07-31", 1)).toBeNull();
  });
});
