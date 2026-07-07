import { test, expect } from "@playwright/test";

/**
 * Live end-to-end auth flow against the real Supabase project.
 * Requires:
 *   - RUN_AUTH_E2E=1
 *   - the 0001_init.sql migration applied
 *   - "Confirm email" turned OFF in Supabase (so signup returns a session)
 * Creates a throwaway user each run.
 */
test.describe("auth + household onboarding", () => {
  test.skip(
    !process.env.RUN_AUTH_E2E,
    "set RUN_AUTH_E2E=1 to run the live Supabase auth flow",
  );

  test("sign up → create household → sign out → sign in", async ({
    page,
  }, testInfo) => {
    // Only create a user once, not once per browser project.
    test.skip(
      testInfo.project.name !== "chromium",
      "auth flow runs on chromium only",
    );
    // This is one long end-to-end happy path; give it room.
    test.setTimeout(120_000);

    const email = `e2e_${Date.now()}@budget-app.test`;
    const password = "test-pw-123456";
    const householdName = "בית הבדיקה";

    // --- Sign up ---
    await page.goto("/login");
    await page.getByRole("tab", { name: "הרשמה" }).click();
    await page.getByLabel("איך קוראים לך?").fill("בודק");
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "יצירת חשבון" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);

    // --- Create household → advances to category setup ---
    await page.getByLabel("שם משק הבית").fill(householdName);
    await page.getByRole("button", { name: "יצירת משק בית" }).click();

    // --- Category & goal setup ---
    await expect(page.getByText("נגדיר את התקציב")).toBeVisible();
    await page.getByLabel("יעד חודשי עבור מזון").fill("2000");
    await page.getByRole("button", { name: /סיום/ }).click();

    // --- Dashboard shows the goals we just set ---
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("מול היעדים")).toBeVisible();
    await expect(page.getByText(householdName)).toBeVisible();

    // --- Dark mode toggle ---
    await page.getByRole("button", { name: "החלפת מצב תצוגה" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // --- Add an expense ---
    await page.getByRole("link", { name: "הוצאות" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await page.getByRole("button", { name: "הוספת הוצאה" }).click();
    await page.getByLabel("סכום").fill("120");
    await page.getByLabel("תיאור").fill("קניות בסופר");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("קניות בסופר")).toBeVisible();

    // --- Dashboard reflects the new expense ---
    await page.goto("/dashboard");
    await expect(page.getByText("התפלגות הוצאות")).toBeVisible();
    await expect(page.getByText(/120/).first()).toBeVisible();
    await page.goto("/transactions");

    // --- Edit it ---
    await page.getByRole("button", { name: /קניות בסופר/ }).click();
    await page.getByLabel("תיאור").fill("קניות שבועיות");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("קניות שבועיות")).toBeVisible();
    await expect(page.getByText("קניות בסופר")).toHaveCount(0);

    // --- Delete it ---
    await page.getByRole("button", { name: /קניות שבועיות/ }).click();
    await page.getByRole("button", { name: "מחיקה" }).click();
    await expect(page.getByText("קניות שבועיות")).toHaveCount(0);

    // --- Import a bank statement ---
    await page.getByRole("link", { name: "ייבוא" }).click();
    await expect(page).toHaveURL(/\/import$/);
    await page
      .locator('input[type="file"]')
      .setInputFiles("e2e/fixtures/statement.xlsx");
    // Review screen appears with the parsed rows
    await expect(page.getByText("שופרסל בדיקה")).toBeVisible();
    await page.getByRole("button", { name: /אישור ושמירה/ }).click();
    // Imported rows land in the expenses list
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByText("שופרסל בדיקה").first()).toBeVisible();
    await expect(page.getByText("דלק בדיקה").first()).toBeVisible();

    // --- Settings: edit a category's monthly goal ---
    await page.getByRole("link", { name: "הגדרות" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByText("קטגוריות ויעדים").click();
    await expect(page).toHaveURL(/\/settings\/categories$/);
    await page.getByRole("button", { name: /מזון/ }).click();
    await page.getByLabel("יעד חודשי").fill("2500");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText(/2,500/).first()).toBeVisible();

    // --- Category drill-down: expand on the dashboard, then open full list ---
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /מזון/ }).first().click();
    await page.getByRole("link", { name: /כל ההוצאות/ }).first().click();
    await expect(page).toHaveURL(/\/transactions\?category=/);
    await expect(page.getByText("הצג הכול")).toBeVisible();

    // --- Recurring page loads ---
    await page.getByRole("link", { name: "קבועות" }).click();
    await expect(page).toHaveURL(/\/recurring$/);
    await expect(
      page.getByRole("heading", { name: "הוצאות קבועות" }),
    ).toBeVisible();

    // --- Sign out ---
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "יציאה" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // --- Sign back in → straight to the dashboard (onboarding done) ---
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "כניסה" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("מול היעדים")).toBeVisible();
  });
});
