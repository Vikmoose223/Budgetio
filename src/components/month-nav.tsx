"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { monthLabel, addMonths } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTHS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/**
 * Month stepper + tap-to-pick dialog. `month` is "YYYY-MM-01".
 * Builds URLs as `${basePath}?...params&month=YYYY-MM` (props stay serializable
 * so this works when rendered from a Server Component).
 */
export function MonthNav({
  month,
  basePath,
  params,
}: {
  month: string;
  basePath: string;
  params?: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [y, m] = month.split("-").map(Number);
  const [year, setYear] = useState(y);

  function hrefFor(ym: string) {
    const sp = new URLSearchParams(params);
    sp.set("month", ym);
    return `${basePath}?${sp.toString()}`;
  }

  function go(mo: number) {
    router.push(hrefFor(`${year}-${String(mo).padStart(2, "0")}`));
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href={hrefFor(addMonths(month, -1).slice(0, 7))}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        aria-label="חודש קודם"
      >
        <ChevronRight className="size-4" />
      </Link>

      <button
        onClick={() => {
          setYear(y);
          setOpen(true);
        }}
        className="min-w-28 text-center text-sm font-semibold transition-colors hover:text-primary"
      >
        {monthLabel(month)}
      </button>

      <Link
        href={hrefFor(addMonths(month, 1).slice(0, 7))}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        aria-label="חודש הבא"
      >
        <ChevronLeft className="size-4" />
      </Link>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>בחירת חודש</DialogTitle>
          </DialogHeader>
          <div className="mb-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setYear((v) => v - 1)}
              aria-label="שנה קודמת"
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-lg font-bold tabular-nums">{year}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setYear((v) => v + 1)}
              aria-label="שנה הבאה"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_HE.map((label, i) => {
              const mo = i + 1;
              const active = year === y && mo === m;
              return (
                <button
                  key={mo}
                  onClick={() => go(mo)}
                  className={cn(
                    "rounded-lg border py-2 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
