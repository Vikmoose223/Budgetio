import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";

// The form talks to Supabase and the router; stub both so we test UI behavior.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: vi.fn(), signUp: vi.fn() },
  }),
}));

test("defaults to login and reveals the name field on the signup tab", async () => {
  const user = userEvent.setup();
  render(<LoginForm next="/dashboard" />);

  // Login mode: submit button says "כניסה", no name field.
  expect(screen.getByRole("button", { name: "כניסה" })).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "הרשמה" }));

  expect(
    screen.getByRole("button", { name: "יצירת חשבון" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("איך קוראים לך?")).toBeInTheDocument();
});
