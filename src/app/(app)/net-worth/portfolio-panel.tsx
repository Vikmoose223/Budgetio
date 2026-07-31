"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/format";
import { ASSET_KIND_LABELS, LIABILITY_KIND_LABELS } from "@/lib/networth/summary";
import type { ValuedAccount, ValuedLiability } from "@/lib/networth/value";
import { ValueBadge } from "./value-badge";
import { AssetForm, type AssetValues, type Member } from "./asset-form";
import { LiabilityForm, type LiabilityValues } from "./liability-form";
import { PrimeRateControl } from "./prime-rate-control";
import { TradesEditor, type TradeRow } from "./trades-editor";
import { DepositsEditor, type FlowRow, type RuleRow } from "./deposits-editor";
import { Plus, Pencil, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

export type OwnerOption = { id: string; label: string };

/** Raw rows needed to prefill the edit forms, kept alongside the valued view. */
export type AccountSeed = {
  id: string;
  kind: string;
  owner_profile_id: string | null;
  currency: string;
  fund_id: number | null;
  fund_source: string | null;
  holdings: { symbol: string; quantity: number; market: string }[];
  latestValuation: { value: number; as_of: string } | null;
  trades: TradeRow[];
  flows: FlowRow[];
  rules: RuleRow[];
};

/** Kinds whose detail view is a trade ledger rather than a deposit list. */
const LEDGER_KINDS = new Set(["brokerage", "crypto"]);
/** Kinds where tracking deposits is what makes the return meaningful. */
const DEPOSIT_KINDS = new Set([
  "pension",
  "gemel",
  "hishtalmut",
  "cash",
  "other",
]);

export type LiabilitySeed = {
  id: string;
  kind: string;
  owner_profile_id: string | null;
  principal: number;
  annual_rate: number;
  term_months: number;
  start_date: string;
  payment_amount: number | null;
  linkage: string;
  balance_override: number | null;
  balance_override_as_of: string | null;
  loan_type: string;
  grace_months: number;
  capitalize_interest: boolean;
  rate_type: string;
  prime_margin: number;
};

export function PortfolioPanel({
  householdId,
  members,
  accounts,
  liabilities,
  accountSeeds,
  liabilitySeeds,
  primeRate,
}: {
  householdId: string;
  members: Member[];
  accounts: ValuedAccount[];
  liabilities: ValuedLiability[];
  accountSeeds: AccountSeed[];
  liabilitySeeds: LiabilitySeed[];
  primeRate: number;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [owner, setOwner] = useState<string>("all");
  const [assetOpen, setAssetOpen] = useState(false);
  const [liabOpen, setLiabOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ValuedAccount | null>(null);
  const [editingLiab, setEditingLiab] = useState<ValuedLiability | null>(null);
  const [detailAsset, setDetailAsset] = useState<ValuedAccount | null>(null);
  const [saving, setSaving] = useState(false);

  const ownerOptions: OwnerOption[] = [
    { id: "all", label: "הכל" },
    ...members.map((m) => ({ id: m.id, label: m.display_name ?? "בן/בת זוג" })),
    { id: "joint", label: "משותף" },
  ];

  const matchesOwner = (ownerProfileId: string | null) =>
    owner === "all" ||
    (owner === "joint" ? ownerProfileId === null : ownerProfileId === owner);

  const shownAccounts = accounts.filter((a) => matchesOwner(a.ownerProfileId));
  const shownLiabilities = liabilities.filter((l) => matchesOwner(l.ownerProfileId));

  const seedFor = (id: string) => accountSeeds.find((s) => s.id === id);
  const liabSeedFor = (id: string) => liabilitySeeds.find((s) => s.id === id);

  // --- Asset save ----------------------------------------------------------

  async function saveAsset(v: AssetValues) {
    setSaving(true);
    try {
      const payload = {
        household_id: householdId,
        name: v.name,
        kind: v.kind,
        owner_profile_id: v.ownerProfileId || null,
        currency: v.currency,
        fund_id: v.fundId ? Number(v.fundId) : null,
        fund_source: v.fundId && v.fundSource ? v.fundSource : null,
      };

      let accountId = editingAsset?.id;
      if (accountId) {
        const { error } = await supabase
          .from("asset_accounts")
          .update(payload)
          .eq("id", accountId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("asset_accounts")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        accountId = data.id;
      }
      if (!accountId) throw new Error("no account id");

      // Replace holdings wholesale — simpler and safe at this scale.
      await supabase.from("holdings").delete().eq("account_id", accountId);
      if (v.holdings.length > 0) {
        const { error } = await supabase.from("holdings").insert(
          v.holdings.map((h) => ({
            account_id: accountId!,
            // Equity tickers are upper-case; CoinGecko ids are lower-case
            // slugs ("ripple", "bitcoin"). Upper-casing those breaks pricing.
            symbol:
              h.market === "crypto"
                ? h.symbol.trim().toLowerCase()
                : h.symbol.trim().toUpperCase(),
            quantity: Number(h.quantity) || 0,
            market: h.market,
          })),
        );
        if (error) throw error;
      }

      // A balance entry becomes the anchor for that date.
      const balance = parseFloat(v.balance);
      if (Number.isFinite(balance)) {
        const { error } = await supabase.from("valuations").upsert(
          {
            account_id: accountId,
            as_of: v.balanceAsOf,
            value: balance,
            source: "manual" as const,
          },
          { onConflict: "account_id,as_of" },
        );
        if (error) throw error;
      }

      setAssetOpen(false);
      setEditingAsset(null);

      // Price the new symbols now rather than leaving it to the page-level
      // refresher, which only fires on its own schedule. Without this a
      // freshly-added holding shows no value until something else happens to
      // trigger a fetch, which reads as "it didn't work".
      if (v.holdings.length > 0) {
        toast.success(editingAsset ? "החשבון עודכן" : "החשבון נוסף");
        try {
          const res = await fetch("/api/net-worth/refresh", { method: "POST" });
          const data = await res.json().catch(() => null);
          if (data?.failed?.length) {
            toast.error(`לא נמשך מחיר עבור ${data.failed.join(", ")}`);
          } else if (data?.prices > 0) {
            toast.success("המחירים עודכנו");
          }
        } catch {
          toast.error("משיכת המחירים נכשלה — נסו את כפתור הרענון");
        }
      } else {
        toast.success(editingAsset ? "החשבון עודכן" : "החשבון נוסף");
      }

      router.refresh();
    } catch {
      toast.error("שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAsset() {
    if (!editingAsset) return;
    setSaving(true);
    const { error } = await supabase
      .from("asset_accounts")
      .delete()
      .eq("id", editingAsset.id);
    setSaving(false);
    if (error) {
      toast.error("מחיקה נכשלה");
      return;
    }
    toast.success("החשבון נמחק");
    setAssetOpen(false);
    setEditingAsset(null);
    router.refresh();
  }

  // --- Liability save ------------------------------------------------------

  async function saveLiability(v: LiabilityValues) {
    setSaving(true);
    try {
      const override = parseFloat(v.balanceOverride);
      const payload = {
        household_id: householdId,
        name: v.name,
        kind: v.kind,
        owner_profile_id: v.ownerProfileId || null,
        principal: parseFloat(v.principal) || 0,
        annual_rate: parseFloat(v.annualRate) || 0,
        term_months: parseInt(v.termMonths, 10) || 0,
        start_date: v.startDate,
        payment_amount: parseFloat(v.paymentAmount) || null,
        linkage: v.linkage,
        balance_override: Number.isFinite(override) ? override : null,
        balance_override_as_of: Number.isFinite(override)
          ? v.balanceOverrideAsOf
          : null,
        loan_type: v.loanType,
        grace_months: v.loanType === "grace" ? parseInt(v.graceMonths, 10) || 0 : 0,
        capitalize_interest: v.capitalizeInterest,
        rate_type: v.rateType,
        prime_margin: v.rateType === "prime" ? parseFloat(v.primeMargin) || 0 : 0,
      };

      const { error } = editingLiab
        ? await supabase.from("liabilities").update(payload).eq("id", editingLiab.id)
        : await supabase.from("liabilities").insert(payload);
      if (error) throw error;

      toast.success(editingLiab ? "ההתחייבות עודכנה" : "ההתחייבות נוספה");
      setLiabOpen(false);
      setEditingLiab(null);
      router.refresh();
    } catch {
      toast.error("שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLiability() {
    if (!editingLiab) return;
    setSaving(true);
    const { error } = await supabase
      .from("liabilities")
      .delete()
      .eq("id", editingLiab.id);
    setSaving(false);
    if (error) {
      toast.error("מחיקה נכשלה");
      return;
    }
    toast.success("ההתחייבות נמחקה");
    setLiabOpen(false);
    setEditingLiab(null);
    router.refresh();
  }

  // --- Prefill -------------------------------------------------------------

  const assetInitial: Partial<AssetValues> | undefined = editingAsset
    ? (() => {
        const seed = seedFor(editingAsset.id);
        return {
          name: editingAsset.name,
          kind: editingAsset.kind,
          ownerProfileId: seed?.owner_profile_id ?? "",
          currency: (seed?.currency as "ILS" | "USD" | "EUR") ?? "ILS",
          fundId: seed?.fund_id ? String(seed.fund_id) : "",
          fundSource: (seed?.fund_source as "gemel" | "pension" | "") ?? "",
          balance: seed?.latestValuation ? String(seed.latestValuation.value) : "",
          balanceAsOf: seed?.latestValuation?.as_of,
          holdings:
            seed?.holdings.map((h) => ({
              symbol: h.symbol,
              quantity: String(h.quantity),
              market: h.market as "us" | "tase" | "crypto",
            })) ?? [],
        };
      })()
    : undefined;

  const liabInitial: Partial<LiabilityValues> | undefined = editingLiab
    ? (() => {
        const seed = liabSeedFor(editingLiab.id);
        return {
          name: editingLiab.name,
          kind: editingLiab.kind,
          ownerProfileId: seed?.owner_profile_id ?? "",
          principal: seed ? String(seed.principal) : "",
          annualRate: seed ? String(seed.annual_rate) : "",
          termMonths: seed ? String(seed.term_months) : "",
          startDate: seed?.start_date,
          paymentAmount: seed?.payment_amount ? String(seed.payment_amount) : "",
          linkage: (seed?.linkage as "none" | "cpi") ?? "none",
          balanceOverride: seed?.balance_override ? String(seed.balance_override) : "",
          balanceOverrideAsOf: seed?.balance_override_as_of ?? undefined,
          loanType: (seed?.loan_type as LiabilityValues["loanType"]) ?? "spitzer",
          graceMonths: seed?.grace_months ? String(seed.grace_months) : "",
          capitalizeInterest: seed?.capitalize_interest ?? false,
          rateType: (seed?.rate_type as "fixed" | "prime") ?? "fixed",
          primeMargin: seed?.prime_margin ? String(seed.prime_margin) : "",
        };
      })()
    : undefined;

  return (
    <>
      {/* Owner filter */}
      {members.length > 1 && (
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {ownerOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOwner(o.id)}
              className={cn(
                "flex-1 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                owner === o.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* Assets */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">נכסים</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingAsset(null);
              setAssetOpen(true);
            }}
          >
            <Plus className="size-4" />
            הוספה
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {shownAccounts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              עדיין אין נכסים. הוסיפו פנסיה, קרן השתלמות, תיק מסחר או נדל״ן.
            </p>
          ) : (
            shownAccounts.map((a) => (
              <Row
                key={a.id}
                title={a.name}
                subtitle={accountSubtitle(a)}
                value={a.value}
                badge={
                  <ValueBadge
                    basis={a.basis}
                    asOf={a.asOf}
                    lastYieldPeriod={a.lastYieldPeriod}
                  />
                }
                returnRate={a.returnRate}
                warning={
                  a.unpricedSymbols.length > 0
                    ? `ללא מחיר: ${a.unpricedSymbols.join(", ")}`
                    : null
                }
                onOpen={() => setDetailAsset(a)}
                onEdit={() => {
                  setEditingAsset(a);
                  setAssetOpen(true);
                }}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Liabilities */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">התחייבויות</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingLiab(null);
              setLiabOpen(true);
            }}
          >
            <Plus className="size-4" />
            הוספה
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {shownLiabilities.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              אין התחייבויות רשומות.
            </p>
          ) : (
            shownLiabilities.map((l) => (
              <Row
                key={l.id}
                title={l.name}
                subtitle={liabilitySubtitle(l)}
                value={l.balance}
                negative
                badge={<ValueBadge basis={l.basis} asOf={l.asOf} />}
                warning={
                  l.balloonDue !== null
                    ? `תשלום בלון בסוף: ${formatILS(l.balloonDue)}`
                    : null
                }
                onEdit={() => {
                  setEditingLiab(l);
                  setLiabOpen(true);
                }}
              />
            ))
          )}
          <PrimeRateControl householdId={householdId} primeRate={primeRate} />
        </CardContent>
      </Card>

      {/* Per-account detail: the ledger for a portfolio, deposits otherwise. */}
      <Dialog
        open={detailAsset !== null}
        onOpenChange={(o) => {
          if (!o) setDetailAsset(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailAsset?.name}</DialogTitle>
            <DialogDescription>
              {detailAsset && LEDGER_KINDS.has(detailAsset.kind)
                ? "מה אתם מחזיקים, בכמה קניתם, וכמה זה עשה."
                : "הפקדות ומשיכות — מה שהופך שינוי ביתרה לתשואה אמיתית."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto">
            {detailAsset &&
              (() => {
                const seed = seedFor(detailAsset.id);
                if (!seed) return null;
                if (LEDGER_KINDS.has(detailAsset.kind)) {
                  return (
                    <TradesEditor
                      accountId={detailAsset.id}
                      positions={detailAsset.positions}
                      trades={seed.trades}
                    />
                  );
                }
                if (DEPOSIT_KINDS.has(detailAsset.kind)) {
                  return (
                    <DepositsEditor
                      accountId={detailAsset.id}
                      flows={seed.flows}
                      rules={seed.rules}
                    />
                  );
                }
                return (
                  <p className="text-sm text-muted-foreground">
                    לנכס מסוג זה אין מעקב עסקאות או הפקדות. עדכנו את השווי דרך
                    עריכת החשבון.
                  </p>
                );
              })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAsset ? "עריכת נכס" : "הוספת נכס"}</DialogTitle>
            <DialogDescription>
              פנסיה, קופת גמל, קרן השתלמות, תיק מסחר, קריפטו, נדל״ן או מזומן.
            </DialogDescription>
          </DialogHeader>
          <AssetForm
            key={editingAsset?.id ?? "new"}
            members={members}
            initial={assetInitial}
            onSubmit={saveAsset}
            onDelete={editingAsset ? deleteAsset : undefined}
            submitting={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={liabOpen} onOpenChange={setLiabOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingLiab ? "עריכת התחייבות" : "הוספת התחייבות"}
            </DialogTitle>
            <DialogDescription>
              משכנתא או הלוואה. היתרה מחושבת מתנאי ההלוואה.
            </DialogDescription>
          </DialogHeader>
          <LiabilityForm
            key={editingLiab?.id ?? "new"}
            members={members}
            initial={liabInitial}
            onSubmit={saveLiability}
            onDelete={editingLiab ? deleteLiability : undefined}
            submitting={saving}
            primeRate={primeRate}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Kind, plus the profit figure once contributions are known. */
function accountSubtitle(a: ValuedAccount): string {
  const parts: string[] = [ASSET_KIND_LABELS[a.kind]];
  if (a.gain !== null && a.contributed !== null && a.contributed !== 0) {
    parts.push(`${a.gain >= 0 ? "רווח" : "הפסד"} ${formatILS(Math.abs(a.gain))}`);
  }
  const open = a.positions.filter((p) => p.quantity > 0).length;
  if (open > 0) parts.push(`${open} ניירות`);
  return parts.join(" · ");
}

/** One line describing the loan's shape, rate and remaining term. */
function liabilitySubtitle(l: ValuedLiability): string {
  const parts: string[] = [LIABILITY_KIND_LABELS[l.kind]];

  if (l.loanType === "none") {
    parts.push("ללא החזר חודשי");
    return parts.join(" · ");
  }
  if (l.loanType === "balloon") parts.push("בלון");
  else if (l.inGrace) parts.push("בגרייס");

  if (l.rate > 0) parts.push(`${l.rate.toFixed(2)}%`);
  if (l.monthlyPayment > 0) parts.push(`${formatILS(l.monthlyPayment)} לחודש`);

  if (l.monthsRemaining > 0) {
    const years = Math.floor(l.monthsRemaining / 12);
    parts.push(years > 0 ? `נותרו ${years} שנים` : `נותרו ${l.monthsRemaining} חודשים`);
  }
  return parts.join(" · ");
}

function Row({
  title,
  subtitle,
  value,
  badge,
  returnRate,
  warning,
  negative,
  onEdit,
  onOpen,
}: {
  title: string;
  subtitle: string;
  value: number | null;
  badge: React.ReactNode;
  returnRate?: number | null;
  warning?: string | null;
  negative?: boolean;
  onEdit: () => void;
  /** Opens the detail view (ledger / deposits). Omit for liabilities. */
  onOpen?: () => void;
}) {
  const Body = onOpen ? "button" : "div";
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-accent/50">
      <Body
        type={onOpen ? "button" : undefined}
        onClick={onOpen}
        className={cn("min-w-0 flex-1", onOpen && "text-right")}
      >
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
          {badge}
        </div>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        {warning && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="size-3 shrink-0" />
            {warning}
          </p>
        )}
      </Body>

      <div className="shrink-0 text-left">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            negative && "text-destructive",
          )}
        >
          {value === null ? "—" : `${negative ? "−" : ""}${formatILS(value)}`}
        </p>
        {returnRate !== null && returnRate !== undefined && (
          <p
            className={cn(
              "flex items-center justify-end gap-0.5 text-xs font-medium",
              returnRate >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {returnRate >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {(returnRate * 100).toFixed(1)}%
          </p>
        )}
      </div>

      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`עריכת ${title}`}>
        <Pencil className="size-4" />
      </Button>
    </div>
  );
}
