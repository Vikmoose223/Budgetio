import { describe, expect, test } from "vitest";
import { generateInsights } from "./insights";
import type { MonthSummary } from "./aggregate";

function cat(id: string, kind: "expense" | "saving" = "expense") {
  return { id, name: id, icon: null, color: null, kind };
}

describe("generateInsights", () => {
  test("flags an over-budget category first, as a warning", () => {
    const summary: MonthSummary = {
      perCategory: [
        { category: cat("מזון"), spent: 500, goal: 400 },
        { category: cat("דיור"), spent: 0, goal: 3000 },
        { category: cat("חיסכון", "saving"), spent: 200, goal: 500 },
      ],
      totalExpenseSpent: 500,
      totalExpenseGoal: 3400,
      totalSavingSpent: 200,
      totalSavingGoal: 500,
    };

    const insights = generateInsights({ summary, prevExpenseTotal: 400 });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].tone).toBe("warning");
    expect(insights[0].title).toContain("מזון");
    // a savings insight is present somewhere
    expect(insights.some((i) => /חיסכון/.test(i.title))).toBe(true);
  });

  test("celebrates staying under budget when nothing is over", () => {
    const summary: MonthSummary = {
      perCategory: [{ category: cat("מזון"), spent: 100, goal: 400 }],
      totalExpenseSpent: 100,
      totalExpenseGoal: 400,
      totalSavingSpent: 0,
      totalSavingGoal: 0,
    };
    const insights = generateInsights({ summary, prevExpenseTotal: null });
    expect(insights.some((i) => i.id === "under-budget")).toBe(true);
    expect(insights.every((i) => i.tone !== "warning")).toBe(true);
  });

  test("caps at four insights", () => {
    const summary: MonthSummary = {
      perCategory: [
        { category: cat("א"), spent: 500, goal: 100 },
        { category: cat("ב"), spent: 500, goal: 100 },
        { category: cat("ג"), spent: 500, goal: 100 },
        { category: cat("חיסכון", "saving"), spent: 500, goal: 500 },
      ],
      totalExpenseSpent: 1500,
      totalExpenseGoal: 300,
      totalSavingSpent: 500,
      totalSavingGoal: 500,
    };
    const insights = generateInsights({ summary, prevExpenseTotal: 100 });
    expect(insights.length).toBeLessThanOrEqual(4);
  });
});
