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
    await expect(page.getByText("היעדים שלכם")).toBeVisible();
    await expect(page.getByText(householdName)).toBeVisible();

    // --- Add an expense ---
    await page.getByRole("link", { name: "הוצאות" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await page.getByRole("button", { name: "הוספת הוצאה" }).click();
    await page.getByLabel("סכום").fill("120");
    await page.getByLabel("תיאור").fill("קניות בסופר");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("קניות בסופר")).toBeVisible();

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

    // --- Sign out ---
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "יציאה" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // --- Sign back in → straight to the dashboard (onboarding done) ---
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "כניסה" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("היעדים שלכם")).toBeVisible();
  });
});
