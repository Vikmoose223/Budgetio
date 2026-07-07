import Link from "next/link";
import { PiggyBank, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Top bar for authenticated pages: brand on one side, sign-out on the other.
 * Sign-out is a plain form POST so it works without client JS.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PiggyBank className="size-4" />
          </span>
          תקציב זוגי
        </Link>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="size-4" />
            יציאה
          </Button>
        </form>
      </div>
    </header>
  );
}
