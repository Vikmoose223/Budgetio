import { test, expect } from "@playwright/test";

/**
 * Live E2E for the two reported bugs:
 *   1. Changing months in the expenses tab must actually change the list.
 *   2. Navigating tabs / opening an expense should feel responsive.
 *
 * Requires (same as auth.spec.ts):
 *   - RUN_AUTH_E2E=1
 *   - 0001_init + 0003_month_start_day migrations applied
 *   - "Confirm email" OFF in Supabase
 * Creates a throwaway user each run.
 */
test.describe("expenses month navigation + latency", () => {
  test.skip(
    !process.env.RUN_AUTH_E2E,
    "set RUN_AUTH_E2E=1 to run the live Supabase flow",
  );

  test("month picker changes the list; tabs/dialog respond fast", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "runs on chromium only",
    );
    test.setTimeout(120_000);

    const email = `e2e_mn_${Date.now()}@budget-app.test`;
    const password = "test-pw-123456";

    // --- Sign up + household + minimal category setup ---
    await page.goto("/login");
    await page.getByRole("tab", { name: "הרשמה" }).click();
    await page.getByLabel("איך קוראים לך?").fill("בודק");
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "יצירת חשבון" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("שם משק הבית").fill("בית הבדיקה");
    await page.getByRole("button", { name: "יצירת משק בית" }).click();
    await expect(page.getByText("נגדיר את התקציב")).toBeVisible();
    await page.getByRole("button", { name: /סיום/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Dates: one expense this month, one exactly ~2 months back so it lands in
    // a clearly different billing period regardless of month_start_day (1).
    const today = new Date();
    const thisMonth = today.toISOString().slice(0, 10);
    const backDate = new Date(today.getFullYear(), today.getMonth() - 2, 15)
      .toISOString()
      .slice(0, 10);
    const prevYM = backDate.slice(0, 7);

    // --- Add current-month expense ---
    await page.goto("/transactions");
    await page.getByRole("button", { name: "הוספת הוצאה" }).click();
    await page.getByLabel("סכום").fill("111");
    await page.getByLabel("תיאור").fill("הוצאה נוכחית");
    await page.getByLabel("תאריך").fill(thisMonth);
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("הוצאה נוכחית")).toBeVisible();

    // --- Add old-month expense ---
    await page.getByRole("button", { name: "הוספה" }).click();
    await page.getByLabel("סכום").fill("222");
    await page.getByLabel("תיאור").fill("הוצאה ישנה");
    await page.getByLabel("תאריך").fill(backDate);
    await page.getByRole("button", { name: "שמירה" }).click();
    // Wait for the save to finish (the dialog closes only after the insert
    // resolves) before navigating — navigating mid-insert would cancel it.
    await expect(page.getByRole("dialog")).toBeHidden();

    // Reload the current month from the server (drops optimistic state). The
    // old expense is outside the current billing period, so it must not show.
    await page.goto("/transactions");
    await expect(page.getByText("הוצאה נוכחית")).toBeVisible();
    await expect(page.getByText("הוצאה ישנה")).toHaveCount(0);

    // === BUG 1: navigate to the previous month via the URL the picker builds ===
    await page.goto(`/transactions?month=${prevYM}`);
    // The old expense must now be visible and the current-month one gone.
    await expect(page.getByText("הוצאה ישנה")).toBeVisible();
    await expect(page.getByText("הוצאה נוכחית")).toHaveCount(0);

    // Also exercise the actual stepper button (client-side navigation, which is
    // where the frozen-state bug lived). Back to current month first.
    await page.goto("/transactions");
    await expect(page.getByText("הוצאה נוכחית")).toBeVisible();
    // Step back one month at a time to the old billing period, waiting for the
    // MonthNav label to actually update between taps (this is what a real user
    // sees; it also proves MonthNav re-renders on client navigation).
    const heMonth = (d: Date) =>
      new Intl.DateTimeFormat("he-IL", { month: "long" }).format(d);
    const oneBackName = heMonth(
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
    );
    const twoBackName = heMonth(
      new Date(today.getFullYear(), today.getMonth() - 2, 1),
    );
    await page.getByLabel("חודש קודם").click();
    await expect(page.getByRole("button", { name: oneBackName })).toBeVisible();
    await page.getByLabel("חודש קודם").click();
    await expect(page.getByRole("button", { name: twoBackName })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`month=${prevYM}`));
    await expect(page.getByText("הוצאה ישנה")).toBeVisible();
    await expect(page.getByText("הוצאה נוכחית")).toHaveCount(0);

    // === BUG 2a: opening an expense dialog is fast (client-only) ===
    await page.goto("/transactions");
    await expect(page.getByText("הוצאה נוכחית")).toBeVisible();
    const openStart = Date.now();
    await page.getByRole("button", { name: /הוצאה נוכחית/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("סכום")).toBeVisible();
    const openMs = Date.now() - openStart;
    console.log(`[latency] open expense dialog: ${openMs}ms`);
    expect(openMs).toBeLessThan(1000);
    // close dialog
    await page.keyboard.press("Escape");

    // === BUG 2b: tab navigation reaches interactive state quickly ===
    const navStart = Date.now();
    await page.getByRole("link", { name: "דשבורד" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("מול היעדים")).toBeVisible();
    const navMs = Date.now() - navStart;
    console.log(`[latency] transactions -> dashboard: ${navMs}ms`);
    expect(navMs).toBeLessThan(4000);

    // === Perceived-lag fix: navigating shows an instant skeleton instead of a
    // frozen screen while the server fetches. Navigate back to expenses and
    // catch the loading skeleton. ===
    await page.getByRole("link", { name: "הוצאות" }).click();
    await expect(page.getByTestId("transactions-loading")).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByText("הוצאה נוכחית")).toBeVisible();
  });
});
