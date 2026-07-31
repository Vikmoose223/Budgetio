"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/format";
import { Search, X, Check, Loader2 } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export type HoldingValue = {
  symbol: string;
  quantity: string;
  market: "us" | "tase" | "crypto";
  /** Human label for a resolved symbol, e.g. "XRP" stored as "ripple". */
  label?: string;
};

type Match = {
  symbol: string;
  name: string;
  ticker: string;
  market: string;
  price: number | null;
  currency: string | null;
  exchange?: string | null;
};

/**
 * One holding. The symbol gets its own full-width row with a search button:
 * cramming it beside the quantity and market selects left it too narrow to
 * type in on a phone, and for crypto the raw ticker is the wrong value anyway
 * — CoinGecko needs "ripple", not "XRP".
 */
export function HoldingRow({
  value,
  onChange,
  onRemove,
}: {
  value: HoldingValue;
  onChange: (patch: Partial<HoldingValue>) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(value.label ?? value.symbol);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = draft.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setMatches(null);
    try {
      const res = await fetch(
        `/api/net-worth/lookup?q=${encodeURIComponent(q)}&market=${value.market}`,
      );
      const data = await res.json();
      const found: Match[] = data.matches ?? [];
      if (found.length === 0) {
        setError("לא נמצא. בדקו את הכתיב, או נסו שוק אחר.");
      } else if (found.length === 1) {
        pick(found[0]);
      } else {
        setMatches(found);
      }
    } catch {
      setError("החיפוש נכשל. נסו שוב.");
    } finally {
      setSearching(false);
    }
  }

  function pick(m: Match) {
    onChange({ symbol: m.symbol, label: m.ticker || m.name });
    setDraft(m.ticker || m.name);
    setMatches(null);
    setError(null);
  }

  const resolved = value.symbol.trim() !== "";

  return (
    <div className="rounded-lg border border-border p-2.5">
      {/* Symbol — its own row, full width, so it's actually usable. */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`sym-${value.market}-${draft}`} className="text-xs">
          נייר / מטבע
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`sym-${value.market}-${draft}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setMatches(null);
              setError(null);
              // Typing invalidates any previously resolved symbol.
              if (value.symbol) onChange({ symbol: "", label: "" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder={
              value.market === "crypto"
                ? "XRP, BTC, SOL…"
                : value.market === "tase"
                  ? "TEVA, POLI…"
                  : "VOO, CSPX, EQQQ, AAPL…"
            }
            dir="ltr"
            className="min-w-0 flex-1 text-left"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={search}
            disabled={searching || !draft.trim()}
            aria-label="חיפוש נייר"
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="הסרת אחזקה"
          >
            <X className="size-4" />
          </Button>
        </div>

        {resolved && (
          <p className="flex items-center gap-1 text-xs text-success">
            <Check className="size-3" />
            מזוהה כ־<span dir="ltr">{value.symbol}</span>
          </p>
        )}
        {!resolved && draft.trim() !== "" && !error && !matches && (
          <p className="text-xs text-muted-foreground">
            לחצו על החיפוש כדי לאמת את הנייר ולמשוך מחיר.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        {matches && (
          <div className="mt-1 flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {matches.map((m) => (
              <button
                key={m.symbol}
                type="button"
                onClick={() => pick(m)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                    {m.symbol}
                    {m.exchange ? ` · ${m.exchange}` : ""}
                  </span>
                </span>
                {m.price !== null && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {m.currency === "ILS" ? formatILS(m.price) : `${m.price} ${m.currency ?? ""}`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quantity and market on their own line. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">כמות</Label>
          <Input
            value={value.quantity}
            onChange={(e) =>
              onChange({
                quantity: e.target.value
                  .replace(/[^\d.]/g, "")
                  .replace(/(\..*)\./g, "$1"),
              })
            }
            placeholder="0"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">שוק</Label>
          <select
            value={value.market}
            onChange={(e) => {
              // Switching market invalidates the resolved symbol.
              onChange({
                market: e.target.value as HoldingValue["market"],
                symbol: "",
                label: "",
              });
              setMatches(null);
              setError(null);
            }}
            className={cn(SELECT_CLASS)}
          >
            <option value="us">מניות וקרנות סל</option>
            <option value="tase">ת״א (בורסה ישראלית)</option>
            <option value="crypto">קריפטו</option>
          </select>
        </div>
      </div>
    </div>
  );
}
