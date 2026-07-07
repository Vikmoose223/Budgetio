import { createElement, type ReactElement } from "react";
import {
  Utensils,
  Home,
  Car,
  Zap,
  Ticket,
  HeartPulse,
  ShoppingBag,
  GraduationCap,
  Wallet,
  PiggyBank,
  Baby,
  Fuel,
  Coffee,
  Gift,
  Dog,
  Plane,
  type LucideIcon,
} from "lucide-react";

export type CategoryKind = "expense" | "saving";

export type DefaultCategory = {
  name: string;
  icon: string; // key into CATEGORY_ICONS
  color: string; // design token, e.g. "chart-1"
  kind: CategoryKind;
  selected: boolean; // pre-checked in onboarding
};

// Icon registry — categories store an icon *name* (string) in the DB, resolved
// here. Works in both server and client components (icons render to SVG).
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Utensils,
  Home,
  Car,
  Zap,
  Ticket,
  HeartPulse,
  ShoppingBag,
  GraduationCap,
  Wallet,
  PiggyBank,
  Baby,
  Fuel,
  Coffee,
  Gift,
  Dog,
  Plane,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Wallet;
}

/**
 * Render a category's icon as an element. Using createElement (instead of
 * `const Icon = categoryIcon(...)` in JSX) keeps the lint rule against
 * defining components during render happy.
 */
export function categoryIconElement(
  name: string | null | undefined,
  className = "size-4",
): ReactElement {
  return createElement(categoryIcon(name), { className });
}

// Inline styles so category colors work with dynamic tokens (Tailwind can't
// scan runtime class names). `color` is a token like "chart-1" → var(--chart-1).
export function categoryColorVar(color: string | null | undefined): string {
  return `var(--${color || "muted-foreground"})`;
}

export function categoryTintStyle(color: string | null | undefined) {
  const v = categoryColorVar(color);
  return {
    color: v,
    backgroundColor: `color-mix(in oklch, ${v} 14%, transparent)`,
  } as const;
}

// The default Israeli category set offered during onboarding.
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "מזון", icon: "Utensils", color: "chart-1", kind: "expense", selected: true },
  { name: "דיור", icon: "Home", color: "chart-2", kind: "expense", selected: true },
  { name: "תחבורה", icon: "Car", color: "chart-3", kind: "expense", selected: true },
  { name: "חשבונות", icon: "Zap", color: "chart-6", kind: "expense", selected: true },
  { name: "בילויים", icon: "Ticket", color: "chart-4", kind: "expense", selected: true },
  { name: "בריאות", icon: "HeartPulse", color: "chart-5", kind: "expense", selected: true },
  { name: "קניות", icon: "ShoppingBag", color: "chart-7", kind: "expense", selected: false },
  { name: "דלק", icon: "Fuel", color: "chart-8", kind: "expense", selected: false },
  { name: "חינוך", icon: "GraduationCap", color: "chart-2", kind: "expense", selected: false },
  { name: "אחר", icon: "Wallet", color: "muted-foreground", kind: "expense", selected: false },
  { name: "חיסכון", icon: "PiggyBank", color: "chart-1", kind: "saving", selected: true },
];

// Icons offered when the user adds a custom category.
export const CUSTOM_ICON_CHOICES = [
  "ShoppingBag",
  "Coffee",
  "Gift",
  "Baby",
  "Dog",
  "Plane",
  "Ticket",
  "Wallet",
];
