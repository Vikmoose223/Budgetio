"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";
import { LIABILITY_KIND_LABELS } from "@/lib/networth/summary";
import type { LiabilityKind } from "@/lib/networth/value";
import type { Member } from "./asset-form";
import { Loader2, Trash2 } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export type LiabilityValues = {
  name: string;
  kind: LiabilityKind;
  ownerProfileId: string;
  principal: string;
  annualRate: string;
  termMonths: string;
  startDate: string;
  paymentAmount: string;
  linkage: "none" | "cpi";
  balanceOverride: string;
  balanceOverrideAsOf: string;
};

export function LiabilityForm({
  members,
  initial,
  onSubmit,
  onDelete,
  submitting,
}: {
  members: Member[];
  initial?: Partial<LiabilityValues>;
  onSubmit: (v: LiabilityValues) => void;
  onDelete?: () => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<LiabilityKind>(initial?.kind ?? "mortgage");
  const [ownerProfileId, setOwnerProfileId] = useState(initial?.ownerProfileId ?? "");
  const [principal, setPrincipal] = useState(initial?.principal ?? "");
  const [annualRate, setAnnualRate] = useState(initial?.annualRate ?? "");
  const [termMonths, setTermMonths] = useState(initial?.termMonths ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO());
  const [paymentAmount, setPaymentAmount] = useState(initial?.paymentAmount ?? "");
  const [linkage, setLinkage] = useState<"none" | "cpi">(initial?.linkage ?? "none");
  const [balanceOverride, setBalanceOverride] = useState(initial?.balanceOverride ?? "");
  const [balanceOverrideAsOf, setBalanceOverrideAsOf] = useState(
    initial?.balanceOverrideAsOf ?? todayISO(),
  );
  const [err, setErr] = useState<string | null>(null);

  const numeric = (v: string) =>
    v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("הזינו שם להתחייבות.");
      return;
    }
    if (!parseFloat(principal) && !parseFloat(balanceOverride)) {
      setErr("הזינו סכום מקורי או יתרה נוכחית.");
      return;
    }
    setErr(null);
    onSubmit({
      name: name.trim(),
      kind,
      ownerProfileId,
      principal,
      annualRate,
      termMonths,
      startDate,
      paymentAmount,
      linkage,
      balanceOverride,
      balanceOverrideAsOf,
    });
  }

  return (
    <form onSubmit={submit} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <Label htmlFor="liab-name">שם</Label>
        <Input
          id="liab-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: משכנתא דירה"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-kind">סוג</Label>
          <select
            id="liab-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as LiabilityKind)}
            className={SELECT_CLASS}
          >
            {Object.entries(LIABILITY_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-owner">שייך ל</Label>
          <select
            id="liab-owner"
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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-principal">סכום מקורי</Label>
          <Input
            id="liab-principal"
            value={principal}
            onChange={(e) => setPrincipal(numeric(e.target.value))}
            placeholder="0"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-rate">ריבית שנתית (%)</Label>
          <Input
            id="liab-rate"
            value={annualRate}
            onChange={(e) => setAnnualRate(numeric(e.target.value))}
            placeholder="4.5"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-term">תקופה (חודשים)</Label>
          <Input
            id="liab-term"
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value.replace(/\D/g, ""))}
            placeholder="360"
            inputMode="numeric"
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-start">תאריך התחלה</Label>
          <Input
            id="liab-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-payment">החזר חודשי (לא חובה)</Label>
          <Input
            id="liab-payment"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(numeric(e.target.value))}
            placeholder="מחושב אוטומטית"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-linkage">הצמדה</Label>
          <select
            id="liab-linkage"
            value={linkage}
            onChange={(e) => setLinkage(e.target.value as "none" | "cpi")}
            className={SELECT_CLASS}
          >
            <option value="none">לא צמוד</option>
            <option value="cpi">צמוד מדד</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">
            אם היתרה המדויקת ידועה לכם מהבנק — הזינו אותה כאן והיא תגבר על החישוב.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-override">יתרה נוכחית</Label>
          <Input
            id="liab-override"
            value={balanceOverride}
            onChange={(e) => setBalanceOverride(numeric(e.target.value))}
            placeholder="מחושב"
            inputMode="decimal"
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-override-date">נכון לתאריך</Label>
          <Input
            id="liab-override-date"
            type="date"
            value={balanceOverrideAsOf}
            onChange={(e) => setBalanceOverrideAsOf(e.target.value)}
            dir="ltr"
          />
        </div>
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
