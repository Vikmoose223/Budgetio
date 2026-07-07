import Link from "next/link";
import { PiggyBank, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesktopNav } from "@/components/nav";

/**
 * Top bar for authenticated pages: brand + desktop nav on one side,
 * sign-out on the other. Sign-out is a plain form POST (no client JS needed).
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PiggyBank className="size-4" />
            </span>
            תקציב זוגי
          </Link>
          <DesktopNav />
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">יציאה</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
