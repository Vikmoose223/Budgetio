import { test, expect } from "@playwright/test";

/**
 * Smoke: the net-worth tab is behind the auth guard like every other (app)
 * route. Runs without Supabase credentials, so it's safe in CI.
 */
test("the net worth tab requires authentication", async ({ page }) => {
  await page.goto("/net-worth");
  await expect(page).toHaveURL(/\/login/);
});

/**
 * Live flow: add an asset and a liability, then check the headline number.
 *
 * Requires (same as auth.spec.ts):
 *   - RUN_AUTH_E2E=1
 *   - migrations 0001–0004 applied
 *   - "Confirm email" OFF in Supabase
 * Creates a throwaway user each run.
 */
test.describe("net worth: assets, liabilities and the net figure", () => {
  test.skip(
    !process.env.RUN_AUTH_E2E,
    "set RUN_AUTH_E2E=1 to run the live Supabase flow",
  );

  test("an asset minus a liability produces the right net worth", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "runs on chromium only");

    // --- Sign up and onboard ---------------------------------------------
    const email = `e2e-nw-${Date.now()}@example.com`;
    await page.goto("/login");
    await page.getByRole("tab", { name: /הרשמה|הרשמו/ }).click().catch(() => {});
    await page.getByLabel(/אימייל|דוא/).fill(email);
    await page.getByLabel(/סיסמה/).first().fill("Passw0rd!e2e");
    await page.getByRole("button", { name: /הרשמה|יצירת/ }).click();

    await page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 30_000 });
    if (page.url().includes("/onboarding")) {
      await page.getByRole("button", { name: /יצירת|משק בית חדש/ }).first().click();
      await page.getByRole("button", { name: /המשך|סיום|שמירה/ }).last().click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    }

    // --- Add an asset ------------------------------------------------------
    await page.goto("/net-worth");
    await page.getByRole("button", { name: "הוספה" }).first().click();

    await page.getByLabel("שם החשבון").fill("קרן השתלמות E2E");
    await page.getByLabel("סוג").first().selectOption("hishtalmut");
    await page.getByLabel("יתרה נוכחית").fill("100000");
    await page.getByRole("button", { name: "שמירה" }).click();

    // Wait for the dialog to close before navigating: an in-flight insert gets
    // cancelled otherwise (the same trap the dedup work hit).
    await expect(page.getByLabel("שם החשבון")).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("קרן השתלמות E2E")).toBeVisible();

    // --- Add a liability ---------------------------------------------------
    await page.getByRole("button", { name: "הוספה" }).last().click();
    await page.getByLabel("שם").first().fill("הלוואה E2E");
    await page.getByLabel("סוג").first().selectOption("personal_loan");
    await page.getByLabel("יתרה נוכחית").fill("40000");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByLabel("שם").first()).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("הלוואה E2E")).toBeVisible();

    // --- The headline number reconciles -----------------------------------
    // 100,000 assets − 40,000 liabilities = 60,000.
    await expect(page.getByText(/60,000/)).toBeVisible({ timeout: 15_000 });

    // Provenance is always shown: a typed-in balance is labelled "ידני".
    await expect(page.getByText("ידני").first()).toBeVisible();

    // Mobile-friendliness: no horizontal scroll.
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(noOverflow).toBe(true);
  });
});
