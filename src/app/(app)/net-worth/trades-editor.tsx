"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatILS, formatDate, todayISO } from "@/lib/format";
import type { ValuedPosition } from "@/lib/networth/positions";
import { HoldingRow, type HoldingValue } from "./holding-row";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, TrendingUp, TrendingDown } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export type TradeRow = {
  id: string;
  symbol: string;
  market: "us" | "tase" | "crypto";
  side: "buy" | "sell";
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee: number;
  occurred_on: string;
  is_opening: boolean;
};

/**
 * The trade ledger for one account: current positions with cost basis and
 * profit, plus the form for adding a trade.
 *
 * The first entry can be an "opening position" — what you already hold and
 * roughly what it cost — so a five-year-old holding doesn't require five years
 * of data entry before the numbers mean anything.
 */
export function TradesEditor({
  accountId,
  positions,
  trades,
}: {
  accountId: string;
  positions: ValuedPosition[];
  trades: TradeRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [holding, setHolding] = useState<HoldingValue>({
    symbol: "",
    quantity: "",
    market: "us",
  });
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [fee, setFee] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [isOpening, setIsOpening] = useState(trades.length === 0);
  const [err, setErr] = useState<string | null>(null);

  const numeric = (v: string) =>
    v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

  function reset() {
    setHolding({ symbol: "", quantity: "", market: "us" });
    setSide("buy");
    setPrice("");
    setFee("");
    setOccurredOn(todayISO());
    setErr(null);
  }

  async function save() {
    if (!holding.symbol.trim()) {
      setErr("בחרו נייר — הקלידו ולחצו על החיפוש.");
      return;
    }
    const qty = parseFloat(holding.quantity);
    const unit = parseFloat(price);
    if (!qty || qty <= 0) {
      setErr("הזינו כמות גדולה מאפס.");
      return;
    }
    if (!Number.isFinite(unit) || unit < 0) {
      setErr("הזינו מחיר ליחידה.");
      return;
    }

    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("trades").insert({
      account_id: accountId,
      symbol:
        holding.market === "crypto"
          ? holding.symbol.trim().toLowerCase()
          : holding.symbol.trim().toUpperCase(),
      market: holding.market,
      side,
      quantity: qty,
      price_per_unit: unit,
      currency,
      fee: parseFloat(fee) || 0,
      occurred_on: occurredOn,
      is_opening: isOpening && side === "buy",
    });
    setSaving(false);

    if (error) {
      toast.error("שמירת העסקה נכשלה");
      return;
    }
    toast.success(isOpening ? "פוזיציית הפתיחה נשמרה" : "העסקה נשמרה");
    setAdding(false);
    setIsOpening(false);
    reset();

    // Price the new symbol straight away rather than waiting for a refresh.
    await fetch("/api/net-worth/refresh", { method: "POST" }).catch(() => {});
    router.refresh();
  }

  async function removeTrade(id: string) {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) {
      toast.error("מחיקה נכשלה");
      return;
    }
    toast.success("העסקה נמחקה");
    router.refresh();
  }

  const open = positions.filter((p) => p.quantity > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* --- Positions ------------------------------------------------------ */}
      {open.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          אין עדיין ניירות. התחילו מ״פוזיציית פתיחה״ — מה שאתם מחזיקים היום ובכמה
          קניתם בממוצע — ומשם הוסיפו קניות ומכירות רגילות.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {open.map((p) => (
            <div key={`${p.market}:${p.symbol}`} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium" dir="ltr">
                    {p.symbol}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.quantity} יח׳ · עלות ממוצעת {p.avgCost} {p.currency}
                    {p.hasOpeningPosition ? " · כולל פוזיציית פתיחה" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <p className="font-semibold tabular-nums">
                    {p.marketValue === null ? "—" : formatILS(p.marketValue)}
                  </p>
                  {p.unrealizedPnl !== null && p.unrealizedPct !== null && (
                    <p
                      className={cn(
                        "flex items-center justify-end gap-0.5 text-xs font-medium",
                        p.unrealizedPnl >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {p.unrealizedPnl >= 0 ? (
                        <TrendingUp className="size-3" />
                      ) : (
                        <TrendingDown className="size-3" />
                      )}
                      {formatILS(Math.abs(p.unrealizedPnl))} (
                      {(p.unrealizedPct * 100).toFixed(1)}%)
                    </p>
                  )}
                </div>
              </div>
              {p.realizedPnl !== 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  רווח שמומש: {formatILS(p.realizedPnl)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* --- Trade history -------------------------------------------------- */}
      {trades.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">עסקאות</p>
          {[...trades]
            .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
            .map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/50"
              >
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                    t.side === "buy"
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {t.is_opening ? "פתיחה" : t.side === "buy" ? "קנייה" : "מכירה"}
                </span>
                <span className="min-w-0 flex-1 truncate" dir="ltr">
                  {t.symbol}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t.quantity} × {t.price_per_unit} {t.currency}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(t.occurred_on)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTrade(t.id)}
                  aria-label="מחיקת עסקה"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
        </div>
      )}

      {/* --- Add ------------------------------------------------------------ */}
      {!adding ? (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          {trades.length === 0 ? "הוספת פוזיציית פתיחה" : "הוספת עסקה"}
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <HoldingRow
            value={holding}
            onChange={(patch) => setHolding((h) => ({ ...h, ...patch }))}
            onRemove={() => {
              setAdding(false);
              reset();
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">פעולה</Label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as "buy" | "sell")}
                className={SELECT_CLASS}
              >
                <option value="buy">קנייה</option>
                <option value="sell">מכירה</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">תאריך</Label>
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">מחיר ליחידה</Label>
              <Input
                value={price}
                onChange={(e) => setPrice(numeric(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">מטבע</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="ILS">₪</option>
                <option value="USD">$</option>
                <option value="EUR">€</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">עמלה</Label>
              <Input
                value={fee}
                onChange={(e) => setFee(numeric(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>

          {side === "buy" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isOpening}
                onChange={(e) => setIsOpening(e.target.checked)}
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <span>
                פוזיציית פתיחה
                <span className="block text-xs text-muted-foreground">
                  מה שכבר החזקתם, במחיר ממוצע — במקום להזין את כל ההיסטוריה.
                </span>
              </span>
            </label>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving && <Loader2 className="size-4 animate-spin" />}
              שמירה
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                reset();
              }}
            >
              ביטול
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
