import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CategorySetup } from "./category-setup";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

test("shows default categories, reveals amount for selected, adds custom", async () => {
  const user = userEvent.setup();
  render(<CategorySetup householdId="h1" />);

  // A default, pre-selected category exposes its monthly-target input.
  expect(screen.getByText("מזון")).toBeInTheDocument();
  expect(screen.getByLabelText("יעד חודשי עבור מזון")).toBeInTheDocument();

  // A non-selected default has no amount field until toggled on.
  expect(
    screen.queryByLabelText("יעד חודשי עבור קניות"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByText("קניות"));
  expect(screen.getByLabelText("יעד חודשי עבור קניות")).toBeInTheDocument();

  // Adding a custom category appends it as selected.
  await user.type(
    screen.getByPlaceholderText("הוספת קטגוריה משלכם"),
    "כלב",
  );
  await user.click(screen.getByRole("button", { name: "הוספה" }));
  expect(screen.getByText("כלב")).toBeInTheDocument();
});
