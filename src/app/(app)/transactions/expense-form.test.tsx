import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ExpenseForm, type Category } from "./expense-form";

const categories: Category[] = [
  { id: "c1", name: "מזון", icon: "Utensils", color: "chart-1", kind: "expense" },
  { id: "c2", name: "דיור", icon: "Home", color: "chart-2", kind: "expense" },
];

test("blocks submit without a positive amount, then submits valid values", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <ExpenseForm categories={categories} onSubmit={onSubmit} submitting={false} />,
  );

  // No amount → validation error, onSubmit not called.
  await user.click(screen.getByRole("button", { name: "שמירה" }));
  expect(screen.getByText("הזינו סכום גדול מאפס.")).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();

  // Valid amount → submits with the chosen (default) category.
  await user.type(screen.getByLabelText("סכום"), "99");
  await user.type(screen.getByLabelText("תיאור"), "בדיקה");
  await user.click(screen.getByRole("button", { name: "שמירה" }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: "99",
      categoryId: "c1",
      description: "בדיקה",
    }),
  );
});
