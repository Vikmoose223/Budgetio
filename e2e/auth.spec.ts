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

    // --- Create household ---
    await page.getByLabel("שם משק הבית").fill(householdName);
    await page.getByRole("button", { name: "יצירת משק בית" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: householdName }),
    ).toBeVisible();

    // --- Sign out ---
    await page.getByRole("button", { name: "יציאה" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // --- Sign back in → lands straight on the dashboard ---
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה").fill(password);
    await page.getByRole("button", { name: "כניסה" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: householdName }),
    ).toBeVisible();
  });
});
