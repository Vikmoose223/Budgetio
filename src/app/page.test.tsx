import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("home page renders the hero heading and primary CTA", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: /לנהל את הכסף שלכם/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "מתחילים" })).toHaveAttribute(
    "href",
    "/login",
  );
});
