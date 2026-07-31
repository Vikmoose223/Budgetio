"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";
import { ASSET_KIND_LABELS } from "@/lib/networth/summary";
import type { AssetKind } from "@/lib/networth/value";
import { HoldingRow, type HoldingValue } from "./holding-row";
import { Loader2, Trash2, Plus } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** Kinds whose value comes from tickers rather than a typed-in balance. */
const HOLDING_KINDS: AssetKind[] = ["brokerage", "crypto"];
/** Kinds that can be linked to a published fund for automatic drift. */
const FUND_KINDS: AssetKind[] = ["pension", "gemel", "hishtalmut"];

export type { HoldingValue };

export type AssetValues = {
  name: string;
  kind: AssetKind;
  ownerProfileId: string;
  currency: "ILS" | "USD" | "EUR";
  fundId: string;
  fundSource: "gemel" | "pension" | "";
  balance: string;
  balanceAsOf: string;
  holdings: HoldingValue[];
};

export type Member = { id: string; display_name: string | null };

export function AssetForm({
  members,
  initial,
  onSubmit,
  onDelete,
  submitting,
}: {
  members: Member[];
  initial?: Partial<AssetValues>;
  onSubmit: (v: AssetValues) => void;
  onDelete?: () => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<AssetKind>(initial?.kind ?? "gemel");
  const [ownerProfileId, setOwnerProfileId] = useState(initial?.ownerProfileId ?? "");
  const [currency, setCurrency] = useState<"ILS" | "USD" | "EUR">(
    initial?.currency ?? "ILS",
  );
  const [fundId, setFundId] = useState(initial?.fundId ?? "");
  const [fundSource, setFundSource] = useState<"gemel" | "pension" | "">(
    initial?.fundSource ?? "",
  );
  const [balance, setBalance] = useState(initial?.balance ?? "");
  const [balanceAsOf, setBalanceAsOf] = useState(
    initial?.balanceAsOf ?? todayISO(),
  );
  const [holdings, setHoldings] = useState<HoldingValue[]>(initial?.holdings ?? []);
  const [err, setErr] = useState<string | null>(null);

  const usesHoldings = HOLDING_KINDS.includes(kind);
  const usesFund = FUND_KINDS.includes(kind);

  function updateHolding(i: number, patch: Partial<HoldingValue>) {
    setHoldings((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("הזינו שם לחשבון.");
      return;
    }
    if (usesHoldings) {
      // A row with a quantity but no resolved symbol would silently vanish on
      // save, so block it rather than drop it.
      const unresolved = holdings.findIndex(
        (h) => !h.symbol.trim() && (h.label?.trim() || h.quantity.trim()),
      );
      if (unresolved !== -1) {
        setErr("יש אחזקה שלא אומתה — לחצו על החיפוש ובחרו את הנייר.");
        return;
      }
      const missingQty = holdings.find((h) => h.symbol.trim() && !parseFloat(h.quantity));
      if (missingQty) {
        setErr(`הזינו כמות עבור ${missingQty.label ?? missingQty.symbol}.`);
        return;
      }
    }
    if (usesFund && fundId.trim() && !fundSource) {
      setErr("בחרו את סוג המאגר (גמל או פנסיה).");
      return;
    }
    setErr(null);
    onSubmit({
      name: name.trim(),
      kind,
      ownerProfileId,
      currency,
      fundId: fundId.trim(),
      fundSource,
      balance,
      balanceAsOf,
      holdings: holdings.filter((h) => h.symbol.trim()),
    });
  }

  return (
    <form onSubmit={submit} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-name">שם החשבון</Label>
        <Input
          id="asset-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: קרן השתלמות מיטב"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="asset-kind">סוג</Label>
          <select
            id="asset-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            className={SELECT_CLASS}
          >
            {Object.entries(ASSET_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="asset-owner">שייך ל</Label>
          <select
            id="asset-owner"
            value={ownerProfileId}
            onChange={(e) => setOwnerProfileId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">משותף</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name ?? "בן/בת זוג"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {usesHoldings ? (
        <div className="flex flex-col gap-2">
          <Label>אחזקות</Label>
          <p className="-mt-1 text-xs text-muted-foreground">
            הקלידו את הנייר ולחצו חיפוש — נאמת אותו מול השוק ונמשוך את המחיר. השווי
            יתעדכן מעצמו מכאן והלאה.
          </p>
          {holdings.map((h, i) => (
            <HoldingRow
              key={i}
              value={h}
              onChange={(patch) => updateHolding(i, patch)}
              onRemove={() => setHoldings((p) => p.filter((_, idx) => idx !== i))}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setHoldings((p) => [
                ...p,
                { symbol: "", quantity: "", market: kind === "crypto" ? "crypto" : "us" },
              ])
            }
          >
            <Plus className="size-4" />
            הוספת אחזקה
          </Button>
        </div>
      ) : null}

      {usesFund && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fund-id">מספר קופה (לא חובה)</Label>
            <Input
              id="fund-id"
              value={fundId}
              onChange={(e) => setFundId(e.target.value.replace(/\D/g, ""))}
              placeholder="למשל: 101"
              inputMode="numeric"
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fund-source">מאגר</Label>
            <select
              id="fund-source"
              value={fundSource}
              onChange={(e) => setFundSource(e.target.value as "gemel" | "pension" | "")}
              className={SELECT_CLASS}
            >
              <option value="">ללא</option>
              <option value="gemel">גמל־נט</option>
              <option value="pension">פנסיה־נט</option>
            </select>
          </div>
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
            עם מספר קופה, השווי יתעדכן לפי התשואות הרשמיות שמתפרסמות מדי חודש.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="asset-balance">
            {usesHoldings ? "יתרה ידנית (גיבוי)" : "יתרה נוכחית"}
          </Label>
          <Input
            id="asset-balance"
            value={balance}
            onChange={(e) =>
              setBalance(e.target.value.replace(/[^\d.-]/g, "").replace(/(\..*)\./g, "$1"))
            }
            placeholder="0"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="asset-as-of">נכון לתאריך</Label>
          <Input
            id="asset-as-of"
            type="date"
            value={balanceAsOf}
            onChange={(e) => setBalanceAsOf(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="asset-currency">מטבע</Label>
        <select
          id="asset-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as "ILS" | "USD" | "EUR")}
          className={SELECT_CLASS}
        >
          <option value="ILS">₪ שקל</option>
          <option value="USD">$ דולר</option>
          <option value="EUR">€ אירו</option>
        </select>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="mt-1 flex items-center gap-2">
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          שמירה
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onDelete}
            disabled={submitting}
            aria-label="מחיקה"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
