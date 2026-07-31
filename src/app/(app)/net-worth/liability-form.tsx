"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";
import { LIABILITY_KIND_LABELS } from "@/lib/networth/summary";
import type { LiabilityKind } from "@/lib/networth/value";
import { effectiveRate, levelPayment, type LoanType } from "@/lib/networth/amortization";
import { formatILS } from "@/lib/format";
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
  loanType: LoanType;
  graceMonths: string;
  capitalizeInterest: boolean;
  rateType: "fixed" | "prime";
  primeMargin: string;
};

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  spitzer: "שפיצר — החזר חודשי קבוע",
  grace: "גרייס — דחיית קרן ואז שפיצר",
  balloon: "בלון — הכל בסוף התקופה",
  none: "ללא החזר חודשי (חוב פתוח)",
};

const LOAN_TYPE_HINTS: Record<LoanType, string> = {
  spitzer: "התשלום החודשי קבוע לאורך כל התקופה.",
  grace: "בתקופת הגרייס לא מחזירים קרן. אחריה ההחזר גבוה יותר, כי אותה קרן נפרסת על פחות חודשים.",
  balloon: "לא מחזירים קרן כלל — כל הסכום נפרע בתאריך הסיום.",
  none: "חוב שפשוט קיים, בלי לוח סילוקין — למשל חוב להורים. היתרה לא משתנה מעצמה.",
};

export function LiabilityForm({
  members,
  initial,
  onSubmit,
  onDelete,
  submitting,
  primeRate,
}: {
  members: Member[];
  initial?: Partial<LiabilityValues>;
  onSubmit: (v: LiabilityValues) => void;
  onDelete?: () => void;
  submitting: boolean;
  /** Household prime rate, for previewing a prime-linked loan's real rate. */
  primeRate: number;
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
  const [loanType, setLoanType] = useState<LoanType>(initial?.loanType ?? "spitzer");
  const [graceMonths, setGraceMonths] = useState(initial?.graceMonths ?? "");
  const [capitalizeInterest, setCapitalizeInterest] = useState(
    initial?.capitalizeInterest ?? false,
  );
  const [rateType, setRateType] = useState<"fixed" | "prime">(
    initial?.rateType ?? "fixed",
  );
  const [primeMargin, setPrimeMargin] = useState(initial?.primeMargin ?? "");
  const [err, setErr] = useState<string | null>(null);

  const numeric = (v: string) =>
    v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
  // Prime margins are routinely negative (פריים מינוס 0.5).
  const signedNumeric = (v: string) =>
    v.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "").replace(/(\..*)\./g, "$1");

  const hasSchedule = loanType !== "none";
  const usesGrace = loanType === "grace";
  const deferred = loanType === "grace" || loanType === "balloon";

  // Live preview of the rate actually in force and what it costs per month.
  const resolvedRate = effectiveRate(
    rateType,
    parseFloat(annualRate) || 0,
    primeRate,
    parseFloat(primeMargin) || 0,
  );
  const previewPrincipal = parseFloat(principal) || 0;
  const previewTerm = parseInt(termMonths, 10) || 0;
  const previewGrace = usesGrace ? Math.min(parseInt(graceMonths, 10) || 0, previewTerm) : 0;
  const previewPayment =
    hasSchedule && previewPrincipal > 0 && previewTerm > 0
      ? loanType === "balloon"
        ? capitalizeInterest
          ? 0
          : (previewPrincipal * resolvedRate) / 100 / 12
        : levelPayment(
            capitalizeInterest
              ? previewPrincipal * Math.pow(1 + resolvedRate / 100 / 12, previewGrace)
              : previewPrincipal,
            resolvedRate,
            previewTerm - previewGrace,
          )
      : 0;

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
    if (usesGrace && previewGrace >= previewTerm && previewTerm > 0) {
      setErr("תקופת הגרייס חייבת להיות קצרה מתקופת ההלוואה. לגרייס מלא בחרו בלון.");
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
      loanType,
      graceMonths,
      capitalizeInterest,
      rateType,
      primeMargin,
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

      {/* Loan structure drives which of the fields below even apply. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="liab-loan-type">סוג ההלוואה</Label>
        <select
          id="liab-loan-type"
          value={loanType}
          onChange={(e) => setLoanType(e.target.value as LoanType)}
          className={SELECT_CLASS}
        >
          {Object.entries(LOAN_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="-mt-1 text-xs text-muted-foreground">
          {LOAN_TYPE_HINTS[loanType]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="liab-principal">
            {hasSchedule ? "סכום מקורי" : "סכום החוב"}
          </Label>
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

      {hasSchedule && (
        <>
          {/* --- Interest ------------------------------------------------- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="liab-rate-type">סוג ריבית</Label>
            <select
              id="liab-rate-type"
              value={rateType}
              onChange={(e) => setRateType(e.target.value as "fixed" | "prime")}
              className={SELECT_CLASS}
            >
              <option value="fixed">ריבית קבועה</option>
              <option value="prime">פריים ± מרווח</option>
            </select>
          </div>

          {rateType === "fixed" ? (
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
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="liab-margin">מרווח מעל/מתחת לפריים</Label>
              <Input
                id="liab-margin"
                value={primeMargin}
                onChange={(e) => setPrimeMargin(signedNumeric(e.target.value))}
                placeholder="0.5 או 0.5-"
                inputMode="text"
                dir="ltr"
                className="text-left"
              />
              <p className="-mt-1 text-xs text-muted-foreground">
                פריים כרגע {primeRate}% ← הריבית בפועל{" "}
                <strong>{resolvedRate.toFixed(2)}%</strong>. למשל פריים מינוס 0.5
                מזינים כ־<span dir="ltr">-0.5</span>.
              </p>
            </div>
          )}

          {/* --- Term and grace ------------------------------------------- */}
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
            {usesGrace && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="liab-grace">חודשי גרייס</Label>
                <Input
                  id="liab-grace"
                  value={graceMonths}
                  onChange={(e) => setGraceMonths(e.target.value.replace(/\D/g, ""))}
                  placeholder="12"
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                />
              </div>
            )}
          </div>

          {deferred && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={capitalizeInterest}
                onChange={(e) => setCapitalizeInterest(e.target.checked)}
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <span>
                {loanType === "balloon" ? "בלון מלא" : "גרייס מלא"} — גם הריבית נצברת
                ולא משלמים כלום
                <span className="block text-xs text-muted-foreground">
                  אם לא מסומן: משלמים ריבית בלבד מדי חודש, והקרן לא זזה.
                </span>
              </span>
            </label>
          )}

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

          {/* What the chosen structure actually costs, before saving. */}
          {previewPrincipal > 0 && previewTerm > 0 && (
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {loanType === "balloon" ? (
                capitalizeInterest ? (
                  <>אין תשלום חודשי. בסוף התקופה נפרע הכל בבת אחת.</>
                ) : (
                  <>
                    ריבית חודשית {formatILS(previewPayment)}, והקרן{" "}
                    {formatILS(previewPrincipal)} נפרעת בסוף.
                  </>
                )
              ) : usesGrace && previewGrace > 0 ? (
                <>
                  {previewGrace} חודשי גרייס, ואחריהם החזר של{" "}
                  <strong>{formatILS(previewPayment)}</strong> לחודש.
                </>
              ) : (
                <>
                  החזר חודשי מוערך: <strong>{formatILS(previewPayment)}</strong>
                </>
              )}
            </div>
          )}
        </>
      )}

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
