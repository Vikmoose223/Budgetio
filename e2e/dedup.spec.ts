import { test, expect } from "@playwright/test";

/**
 * Live E2E for fuzzy duplicate detection (same name+date+amount) on both the
 * manual-add and import flows.
 *
 * Requires (same as auth.spec.ts): RUN_AUTH_E2E=1, migrations applied,
 * "Confirm email" OFF. Creates a throwaway user each run.
 */
test.describe("duplicate detection", () => {
  test.skip(
    !process.env.RUN_AUTH_E2E,
    "set RUN_AUTH_E2E=1 to run the live Supabase flow",
  );

  test("flags duplicates on manual add and import; keep/replace/skip work", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
    test.setTimeout(120_000);

    const email = `e2e_dup_${Date.now()}@budget-app.test`;
    const password = "test-pw-123456";

    // --- Onboard ---
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

    // Dates within the current billing month (today is mid-month).
    const d1 = new Date().toISOString().slice(0, 8) + "08";
    const dShufersal = new Date().toISOString().slice(0, 8) + "05";

    const addExpense = async (
      amount: string,
      description: string,
      date: string,
    ) => {
      await page
        .getByRole("button", { name: /הוספה|הוספת הוצאה/ })
        .first()
        .click();
      await page.getByLabel("סכום").fill(amount);
      await page.getByLabel("תיאור").fill(description);
      await page.getByLabel("תאריך").fill(date);
      await page.getByRole("button", { name: "שמירה" }).click();
    };

    // === MANUAL: first expense saves normally ===
    await page.goto("/transactions");
    await addExpense("77", "כפילות בדיקה", d1);
    await expect(page.getByText("כפילות בדיקה")).toHaveCount(1);

    // === MANUAL: identical expense → duplicate dialog, then "ביטול" ===
    await addExpense("77", "כפילות בדיקה", d1);
    await expect(page.getByText("נמצאה הוצאה זהה")).toBeVisible();
    await page.getByRole("button", { name: "ביטול" }).click();
    await expect(page.getByText("נמצאה הוצאה זהה")).toHaveCount(0);
    await expect(page.getByText("כפילות בדיקה")).toHaveCount(1); // nothing added

    // === MANUAL: identical → "שמור שניהם" keeps both ===
    await addExpense("77", "כפילות בדיקה", d1);
    await expect(page.getByText("נמצאה הוצאה זהה")).toBeVisible();
    await page.getByRole("button", { name: "שמור שניהם" }).click();
    await expect(page.getByText("נמצאה הוצאה זהה")).toHaveCount(0);
    await expect(page.getByText("כפילות בדיקה")).toHaveCount(2); // now two

    // === MANUAL: identical → "החלף קיים" replaces in place (still two) ===
    await addExpense("77", "כפילות בדיקה", d1);
    await expect(page.getByText("נמצאה הוצאה זהה")).toBeVisible();
    await page.getByRole("button", { name: "החלף קיים" }).click();
    await expect(page.getByText("נמצאה הוצאה זהה")).toHaveCount(0);
    await expect(page.getByText("כפילות בדיקה")).toHaveCount(2); // not three

    // === IMPORT: seed a manual expense that matches an import row ===
    await addExpense("250", "שופרסל בדיקה", dShufersal);
    await expect(page.getByText("שופרסל בדיקה")).toHaveCount(1);

    // Import the statement — שופרסל row must be flagged as a possible duplicate.
    await page.getByRole("link", { name: "ייבוא" }).click();
    await expect(page).toHaveURL(/\/import$/);
    await page
      .locator('input[type="file"]')
      .setInputFiles("e2e/fixtures/statement.xlsx");
    await expect(page.getByText("שופרסל בדיקה")).toBeVisible();
    await expect(page.getByText("כפילות אפשרית")).toHaveCount(1);
    await expect(page.getByText(/1 כפילויות אפשריות/)).toBeVisible();

    // Choose "החלף" for the flagged row, then save.
    await page.getByRole("button", { name: "החלף", exact: true }).click();
    await page.getByRole("button", { name: /אישור ושמירה/ }).click();

    // Back on the expenses list: שופרסל stays a single row (replaced, not
    // duplicated); the two new rows imported normally. Count row *buttons*
    // (a row's merchant can also appear in its subtitle, so getByText would
    // double-count within one row).
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(
      page.getByRole("button", { name: /שופרסל בדיקה/ }),
    ).toHaveCount(1);
    await expect(page.getByRole("button", { name: /דלק בדיקה/ })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /עסק אלמוני/ }),
    ).toHaveCount(1);
  });
});
