"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

/**
 * The household's prime rate, edited by hand.
 *
 * Deliberately not fetched: Bank of Israel moves it about eight times a year
 * on announced dates, and a scrape that quietly went stale would misprice
 * every prime-linked loan while still looking live. A number you set and can
 * see is more trustworthy than one that only appears automatic.
 */
export function PrimeRateControl({
  householdId,
  primeRate,
}: {
  householdId: string;
  primeRate: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(primeRate));
  const [saving, setSaving] = useState(false);

  async function save() {
    const rate = parseFloat(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
      toast.error("הזינו ריבית בין 0 ל-50.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("households")
      .update({ prime_rate: rate })
      .eq("id", householdId);
    setSaving(false);
    if (error) {
      toast.error("עדכון נכשל");
      return;
    }
    toast.success("ריבית הפריים עודכנה");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <span>ריבית פריים: {primeRate}%</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-0.5 hover:text-foreground"
        >
          <Pencil className="size-3" />
          עדכון
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center justify-center gap-2">
      <span className="text-xs text-muted-foreground">ריבית פריים</span>
      <Input
        value={value}
        onChange={(e) =>
          setValue(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))
        }
        inputMode="decimal"
        dir="ltr"
        className="h-7 w-20 text-left"
        aria-label="ריבית פריים"
        autoFocus
      />
      <Button size="icon" variant="ghost" onClick={save} disabled={saving} aria-label="שמירה">
        <Check className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          setValue(String(primeRate));
          setEditing(false);
        }}
        aria-label="ביטול"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
