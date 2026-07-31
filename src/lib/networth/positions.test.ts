import { expect, test, describe } from "vitest";
import {
  buildPositions,
  valuePositions,
  tradesAsFlows,
  type Trade,
} from "./positions";
import { fxTableFrom } from "./currency";

const fx = fxTableFrom([{ base: "USD", quote: "ILS", rate: 3 }]);

const trade = (over: Partial<Trade> = {}): Trade => ({
  symbol: "VOO",
  market: "us",
  side: "buy",
  quantity: 10,
  price_per_unit: 100,
  currency: "USD",
  fee: 0,
  occurred_on: "2026-01-01",
  ...over,
});

describe("buildPositions", () => {
  test("a single buy sets quantity and average cost", () => {
    const [p] = buildPositions([trade({ quantity: 10, price_per_unit: 100 })]);
    expect(p.quantity).toBe(10);
    expect(p.avgCost).toBe(100);
    expect(p.costBasis).toBe(1000);
  });

  test("a second buy at a different price averages correctly", () => {
    const [p] = buildPositions([
      trade({ quantity: 10, price_per_unit: 100, occurred_on: "2026-01-01" }),
      trade({ quantity: 10, price_per_unit: 200, occurred_on: "2026-02-01" }),
    ]);
    expect(p.quantity).toBe(20);
    expect(p.avgCost).toBe(150);
    expect(p.costBasis).toBe(3000);
  });

  test("fees are part of what the position cost", () => {
    const [p] = buildPositions([
      trade({ quantity: 10, price_per_unit: 100, fee: 50 }),
    ]);
    expect(p.avgCost).toBe(105);
    expect(p.totalFees).toBe(50);
  });

  test("selling banks profit and leaves the average untouched", () => {
    const [p] = buildPositions([
      trade({ quantity: 10, price_per_unit: 100, occurred_on: "2026-01-01" }),
      trade({
        side: "sell",
        quantity: 4,
        price_per_unit: 150,
        occurred_on: "2026-03-01",
      }),
    ]);
    expect(p.quantity).toBe(6);
    expect(p.avgCost).toBe(100);
    expect(p.costBasis).toBe(600);
    // 4 × (150 − 100)
    expect(p.realizedPnl).toBe(200);
  });

  test("a sale is priced against the average that existed at the time", () => {
    // Buy cheap, sell, then buy expensive. If the trades were applied out of
    // order the realized figure would be wrong.
    const [p] = buildPositions([
      trade({ quantity: 10, price_per_unit: 100, occurred_on: "2026-01-01" }),
      trade({
        side: "sell",
        quantity: 5,
        price_per_unit: 120,
        occurred_on: "2026-02-01",
      }),
      trade({ quantity: 5, price_per_unit: 300, occurred_on: "2026-03-01" }),
    ]);
    // Sold at 120 against an average of 100 → 100 profit, not against 200.
    expect(p.realizedPnl).toBe(100);
    expect(p.quantity).toBe(10);
    expect(p.avgCost).toBe(200); // (500 remaining + 1500 new) / 10
  });

  test("input order does not matter — trades are replayed by date", () => {
    const ordered = buildPositions([
      trade({ quantity: 10, price_per_unit: 100, occurred_on: "2026-01-01" }),
      trade({ quantity: 10, price_per_unit: 200, occurred_on: "2026-02-01" }),
    ]);
    const shuffled = buildPositions([
      trade({ quantity: 10, price_per_unit: 200, occurred_on: "2026-02-01" }),
      trade({ quantity: 10, price_per_unit: 100, occurred_on: "2026-01-01" }),
    ]);
    expect(shuffled[0].avgCost).toBe(ordered[0].avgCost);
  });

  test("selling everything closes the position at zero", () => {
    const [p] = buildPositions([
      trade({ quantity: 10, price_per_unit: 100 }),
      trade({
        side: "sell",
        quantity: 10,
        price_per_unit: 130,
        occurred_on: "2026-06-01",
      }),
    ]);
    expect(p.quantity).toBe(0);
    expect(p.costBasis).toBe(0);
    expect(p.realizedPnl).toBe(300);
  });

  test("you cannot sell more than you hold", () => {
    const [p] = buildPositions([
      trade({ quantity: 5, price_per_unit: 100 }),
      trade({
        side: "sell",
        quantity: 999,
        price_per_unit: 120,
        occurred_on: "2026-06-01",
      }),
    ]);
    expect(p.quantity).toBe(0);
    // Only the 5 actually held count toward the realized figure.
    expect(p.realizedPnl).toBe(100);
  });

  test("separate symbols and markets don't mix", () => {
    const positions = buildPositions([
      trade({ symbol: "VOO", market: "us" }),
      trade({ symbol: "TEVA.TA", market: "tase", currency: "ILS" }),
      trade({ symbol: "ripple", market: "crypto", currency: "ILS" }),
    ]);
    expect(positions).toHaveLength(3);
  });

  test("an opening position is flagged so the UI can caveat it", () => {
    const [p] = buildPositions([trade({ is_opening: true })]);
    expect(p.hasOpeningPosition).toBe(true);
  });

  test("no trades means no positions, not a crash", () => {
    expect(buildPositions([])).toEqual([]);
  });
});

describe("valuePositions", () => {
  const positions = buildPositions([
    trade({ quantity: 10, price_per_unit: 100, currency: "USD" }),
  ]);

  test("computes unrealized profit against cost", () => {
    const [v] = valuePositions(
      positions,
      () => ({ price: 150, currency: "USD" }),
      fx,
    );
    // Cost 1000 USD → ₪3,000. Value 1500 USD → ₪4,500.
    expect(v.costBasisILS).toBe(3000);
    expect(v.marketValue).toBe(4500);
    expect(v.unrealizedPnl).toBe(1500);
    expect(v.unrealizedPct).toBeCloseTo(0.5, 6);
  });

  test("a loss is negative, not hidden", () => {
    const [v] = valuePositions(
      positions,
      () => ({ price: 80, currency: "USD" }),
      fx,
    );
    expect(v.unrealizedPnl).toBe(-600);
    expect(v.unrealizedPct).toBeCloseTo(-0.2, 6);
  });

  test("TASE prices in agorot convert before comparison", () => {
    const taseTrades = buildPositions([
      trade({
        symbol: "TEVA.TA",
        market: "tase",
        currency: "ILS",
        quantity: 100,
        price_per_unit: 100,
      }),
    ]);
    const [v] = valuePositions(
      taseTrades,
      () => ({ price: 10870, currency: "ILA" }),
      fx,
    );
    // ₪108.70 × 100 = ₪10,870 against a ₪10,000 cost.
    expect(v.marketValue).toBeCloseTo(10870, 2);
    expect(v.unrealizedPnl).toBeCloseTo(870, 2);
  });

  test("an unpriced position reports cost but no profit figure", () => {
    const [v] = valuePositions(positions, () => null, fx);
    expect(v.costBasisILS).toBe(3000);
    expect(v.marketValue).toBeNull();
    expect(v.unrealizedPnl).toBeNull();
    expect(v.unrealizedPct).toBeNull();
  });

  test("a zero cost basis yields no percentage rather than Infinity", () => {
    const free = buildPositions([
      trade({ quantity: 10, price_per_unit: 0, currency: "ILS" }),
    ]);
    const [v] = valuePositions(free, () => ({ price: 5, currency: "ILS" }), fx);
    expect(v.unrealizedPct).toBeNull();
    expect(Number.isFinite(v.unrealizedPnl!)).toBe(true);
  });
});

describe("tradesAsFlows", () => {
  test("a buy is money in, a sale is money out", () => {
    const flows = tradesAsFlows(
      [
        trade({ quantity: 10, price_per_unit: 100, currency: "USD" }),
        trade({
          side: "sell",
          quantity: 5,
          price_per_unit: 200,
          currency: "USD",
          occurred_on: "2026-06-01",
        }),
      ],
      fx,
    );
    expect(flows[0].amount).toBe(3000); // 10 × 100 USD × 3
    expect(flows[1].amount).toBe(-3000); // 5 × 200 USD × 3, outgoing
  });

  test("fees increase a purchase and reduce a sale", () => {
    const [buy] = tradesAsFlows(
      [trade({ quantity: 1, price_per_unit: 100, currency: "ILS", fee: 10 })],
      fx,
    );
    expect(buy.amount).toBe(110);

    const [sell] = tradesAsFlows(
      [
        trade({
          side: "sell",
          quantity: 1,
          price_per_unit: 100,
          currency: "ILS",
          fee: 10,
        }),
      ],
      fx,
    );
    expect(sell.amount).toBe(-90);
  });

  test("trades in an unknown currency are skipped, not counted as shekels", () => {
    expect(tradesAsFlows([trade({ currency: "JPY" })], fx)).toEqual([]);
  });
});
