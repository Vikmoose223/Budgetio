import { test, expect } from "@playwright/test";

test("landing page loads, is RTL, and links to login", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /לנהל את הכסף שלכם/ }),
  ).toBeVisible();

  // The whole app is RTL; assert it at the document root.
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // /login is built in stage 1; here we only assert the entry point wires to it.
  await expect(page.getByRole("link", { name: "מתחילים" })).toHaveAttribute(
    "href",
    "/login",
  );

  // Mobile-friendliness: the page must not scroll horizontally (this test also
  // runs under the Pixel 7 viewport via the "mobile" Playwright project).
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(noOverflow).toBe(true);
});
