"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";
import { ASSET_KIND_LABELS } from "@/lib/networth/summary";
import type { AssetKind } from "@/lib/networth/value";
import { Loader2, Trash2, Plus, X } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** Kinds whose value comes from tickers rather than a typed-in balance. */
const HOLDING_KINDS: AssetKind[] = ["brokerage", "crypto"];
/** Kinds that can be linked to a published fund for automatic drift. */
const FUND_KINDS: AssetKind[] = ["pension", "gemel", "hishtalmut"];

export type HoldingValue = {
  symbol: string;
  quantity: string;
  market: "us" | "tase" | "crypto";
};

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
      const bad = holdings.find((h) => h.symbol.trim() && !parseFloat(h.quantity));
      if (bad) {
        setErr(`הזינו כמות עבור ${bad.symbol}.`);
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
            טיקר וכמות — השווי יתעדכן אוטומטית לפי מחירי השוק. לת״א הוסיפו סיומת
            <span dir="ltr"> .TA</span> (למשל <span dir="ltr">TEVA.TA</span>), לקריפטו
            השתמשו במזהה CoinGecko (למשל <span dir="ltr">bitcoin</span>).
          </p>
          {holdings.map((h, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  value={h.symbol}
                  onChange={(e) => updateHolding(i, { symbol: e.target.value })}
                  placeholder="VOO"
                  dir="ltr"
                  aria-label="טיקר"
                />
              </div>
              <div className="w-24">
                <Input
                  value={h.quantity}
                  onChange={(e) =>
                    updateHolding(i, {
                      quantity: e.target.value
                        .replace(/[^\d.]/g, "")
                        .replace(/(\..*)\./g, "$1"),
                    })
                  }
                  placeholder="כמות"
                  inputMode="decimal"
                  dir="ltr"
                  aria-label="כמות"
                />
              </div>
              <select
                value={h.market}
                onChange={(e) =>
                  updateHolding(i, { market: e.target.value as HoldingValue["market"] })
                }
                className={`${SELECT_CLASS} w-24`}
                aria-label="שוק"
              >
                <option value="us">חו״ל</option>
                <option value="tase">ת״א</option>
                <option value="crypto">קריפטו</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setHoldings((p) => p.filter((_, idx) => idx !== i))}
                aria-label="הסרה"
              >
                <X className="size-4" />
              </Button>
            </div>
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
