import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatILS,
  todayISO,
  addMonths,
  firstOfMonthISO,
  monthLabel,
  budgetMonthOf,
  periodRange,
} from "@/lib/format";
import { fxTableFrom } from "@/lib/networth/currency";
import { priceIndex, valueAccount, valueLiability } from "@/lib/networth/value";
import type { AccountRow, LiabilityRow, ValuedAccount } from "@/lib/networth/value";
import { summarizeNetWorth } from "@/lib/networth/summary";
import { netWorthTrend } from "@/lib/networth/trend";
import { cpiRatio } from "@/lib/networth/sources/cpi";
import { generateNetWorthInsights } from "@/lib/networth/insights";
import { periodOf } from "@/lib/networth/drift";
import type { Insight } from "@/lib/insights";
import {
  compareTo,
  compareAccounts,
  monthsAgo,
  daysUntilComparable,
} from "@/lib/networth/compare";
import { AllocationDonut } from "./allocation-donut";
import { NetWorthTrend } from "./net-worth-trend";
import { PortfolioPanel } from "./portfolio-panel";
import { MarketRefresher } from "./market-refresher";
import { ComparisonCard, type PeriodComparison } from "./comparison-card";
import { SnapshotWriter } from "./snapshot-writer";
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";

/** Market data older than this triggers a background refresh on view. */
const STALE_AFTER_HOURS = 12;

const CHART_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export default async function NetWorthPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) redirect("/onboarding");
  const householdId = profile.household_id;

  const today = todayISO();

  const [
    { data: household },
    { data: members },
    { data: accountRows },
    { data: liabilityRows },
    { data: fxRows },
    { data: cpiRows },
  ] = await Promise.all([
    supabase
      .from("households")
      .select("name, month_start_day, prime_rate")
      .eq("id", householdId)
      .single(),
    supabase.from("profiles").select("id, display_name").eq("household_id", householdId),
    supabase
      .from("asset_accounts")
      .select(
        "id, name, kind, owner_profile_id, currency, fund_id, fund_source, sort_order",
      )
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("sort_order"),
    supabase
      .from("liabilities")
      .select("*")
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("sort_order"),
    supabase.from("fx_rates").select("base, quote, rate, as_of"),
    supabase.from("cpi_index").select("period, value"),
  ]);

  const accounts = (accountRows ?? []) as AccountRow[];
  const liabilities = (liabilityRows ?? []) as LiabilityRow[];
  const accountIds = accounts.map((a) => a.id);

  // Child rows and market caches, only when there's something to look up.
  const [
    { data: holdingRows },
    { data: valuationRows },
    { data: flowRows },
    { data: priceRows },
    { data: yieldRows },
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from("holdings")
          .select("account_id, symbol, quantity, market")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as never[] }),
    accountIds.length
      ? supabase
          .from("valuations")
          .select("account_id, as_of, value")
          .in("account_id", accountIds)
          .order("as_of", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    accountIds.length
      ? supabase
          .from("account_flows")
          .select("id, account_id, occurred_on, amount, note")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("price_cache").select("symbol, market, price, currency, as_of, fetched_at"),
    supabase
      .from("fund_yields_cache")
      .select("fund_id, source, report_period, monthly_yield, avg_mgmt_fee"),
  ]);

  // Ledger, standing rules and recorded history.
  const [
    { data: tradeRows },
    { data: ruleRows },
    { data: accountSnapshotRows },
    { data: netSnapshotRows },
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from("trades")
          .select(
            "id, account_id, symbol, market, side, quantity, price_per_unit, currency, fee, occurred_on, is_opening",
          )
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as never[] }),
    accountIds.length
      ? supabase
          .from("recurring_flows")
          .select("id, account_id, amount, day_of_month, start_month, end_month, note")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as never[] }),
    accountIds.length
      ? supabase
          .from("account_snapshots")
          .select("account_id, as_of, value")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("net_worth_snapshots")
      .select("as_of, net_worth")
      .eq("household_id", householdId),
  ]);

  // --- Index the raw rows by account ---------------------------------------

  const byAccount = <T extends { account_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const row of rows ?? []) {
      const list = map.get(row.account_id);
      if (list) list.push(row);
      else map.set(row.account_id, [row]);
    }
    return map;
  };

  const holdingsBy = byAccount(holdingRows);
  const valuationsBy = byAccount(valuationRows);
  const flowsBy = byAccount(flowRows);
  const tradesBy = byAccount(tradeRows);
  const rulesBy = byAccount(ruleRows);

  const fx = fxTableFrom(fxRows ?? []);
  const prices = priceIndex(priceRows ?? []);

  const yieldsByFund = new Map<string, { report_period: number; monthly_yield: number | null }[]>();
  const feeByFund = new Map<string, number>();
  for (const y of yieldRows ?? []) {
    const key = `${y.source}:${y.fund_id}`;
    const list = yieldsByFund.get(key);
    const entry = { report_period: y.report_period, monthly_yield: y.monthly_yield };
    if (list) list.push(entry);
    else yieldsByFund.set(key, [entry]);
    if (y.avg_mgmt_fee !== null && !feeByFund.has(key)) {
      feeByFund.set(key, Number(y.avg_mgmt_fee));
    }
  }

  // --- Value everything ----------------------------------------------------

  const cpiRatioAt = (asOf: string, startDate: string) =>
    cpiRatio(cpiRows ?? [], periodOf(startDate), periodOf(asOf));

  const valuedAccounts: ValuedAccount[] = accounts.map((account) => {
    const fundKey =
      account.fund_id !== null && account.fund_source
        ? `${account.fund_source}:${account.fund_id}`
        : null;
    return valueAccount({
      account,
      holdings: (holdingsBy.get(account.id) ?? []).map((h) => ({
        symbol: h.symbol,
        quantity: Number(h.quantity),
        market: h.market as "us" | "tase" | "crypto",
      })),
      prices,
      valuations: (valuationsBy.get(account.id) ?? []).map((v) => ({
        as_of: v.as_of,
        value: Number(v.value),
      })),
      flows: (flowsBy.get(account.id) ?? []).map((f) => ({
        occurred_on: f.occurred_on,
        amount: Number(f.amount),
      })),
      yields: fundKey ? (yieldsByFund.get(fundKey) ?? []) : [],
      fx,
      asOf: today,
      trades: (tradesBy.get(account.id) ?? []).map((t) => ({
        symbol: t.symbol,
        market: t.market as "us" | "tase" | "crypto",
        side: t.side as "buy" | "sell",
        quantity: Number(t.quantity),
        price_per_unit: Number(t.price_per_unit),
        currency: t.currency,
        fee: Number(t.fee),
        occurred_on: t.occurred_on,
        is_opening: t.is_opening,
      })),
      recurringRules: (rulesBy.get(account.id) ?? []).map((r) => ({
        amount: Number(r.amount),
        day_of_month: r.day_of_month,
        start_month: r.start_month,
        end_month: r.end_month,
      })),
    });
  });

  const primeRate = Number(household?.prime_rate ?? 0);
  const valuedLiabilities = liabilities.map((l) =>
    valueLiability(l, today, fx, cpiRatioAt(today, l.start_date), primeRate),
  );

  const summary = summarizeNetWorth(valuedAccounts, valuedLiabilities);

  // --- Trend ---------------------------------------------------------------

  const thisMonth = firstOfMonthISO(new Date());
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5));
  const trend = netWorthTrend(
    months,
    accounts.map((a) => ({
      id: a.id,
      currency: a.currency,
      valuations: (valuationsBy.get(a.id) ?? []).map((v) => ({
        as_of: v.as_of,
        value: Number(v.value),
      })),
    })),
    liabilities,
    fx,
    cpiRatioAt,
  );
  // The current month reflects live valuation rather than the last snapshot.
  if (trend.length > 0) {
    trend[trend.length - 1] = {
      ...trend[trend.length - 1],
      assets: summary.totalAssets,
      liabilities: summary.totalLiabilities,
      net: summary.netWorth,
    };
  }
  const prevNetWorth = trend.length >= 2 ? trend[trend.length - 2].net : null;
  const netDiff = prevNetWorth !== null ? summary.netWorth - prevNetWorth : null;

  // --- Average monthly spending, for the runway insight --------------------

  const startDay = household?.month_start_day ?? 1;
  const spendFrom = periodRange(
    addMonths(budgetMonthOf(today, startDay), -2),
    startDay,
  ).start;
  const spendTo = periodRange(budgetMonthOf(today, startDay), startDay).start;
  const { data: recentTxns } = await supabase
    .from("transactions")
    .select("amount")
    .eq("household_id", householdId)
    .gte("occurred_on", spendFrom)
    .lt("occurred_on", spendTo);

  const avgMonthlyExpenses =
    recentTxns && recentTxns.length > 0
      ? recentTxns.reduce((sum, t) => sum + Number(t.amount), 0) / 3
      : null;

  // --- Freshness -----------------------------------------------------------

  const newestFetch = (priceRows ?? []).reduce<string | null>(
    (newest, p) => (!newest || p.fetched_at > newest ? p.fetched_at : newest),
    null,
  );
  // Whether that timestamp counts as stale is decided on the client — reading
  // the clock during render is impure.
  // A fund-linked account has no holdings, so gating the refresher on holdings
  // alone meant a household with only a pension never fetched anything at all.
  const fundLinked = accounts.filter((a) => a.fund_id !== null && a.fund_source);
  const hasAutoPriced = (holdingRows ?? []).length > 0 || fundLinked.length > 0;

  // Anything we should be able to value but can't needs a fetch regardless of
  // how fresh the rest of the cache looks.
  const missingYields = fundLinked.some(
    (a) => (yieldsByFund.get(`${a.fund_source}:${a.fund_id}`) ?? []).length === 0,
  );
  const hasUnpriced =
    valuedAccounts.some((a) => a.unpricedSymbols.length > 0) || missingYields;

  const feeByAccountId = new Map<string, number>();
  for (const a of accounts) {
    if (a.fund_id === null || !a.fund_source) continue;
    const fee = feeByFund.get(`${a.fund_source}:${a.fund_id}`);
    if (fee !== undefined) feeByAccountId.set(a.id, fee);
  }

  const insights = generateNetWorthInsights({
    summary,
    accounts: valuedAccounts,
    liabilities: valuedLiabilities,
    prevNetWorth,
    avgMonthlyExpenses,
    feeByAccountId,
  });

  // --- Comparison against recorded history ---------------------------------

  const netSnapshots = (netSnapshotRows ?? []).map((s) => ({
    as_of: s.as_of,
    value: Number(s.net_worth),
  }));
  const allAccountSnapshots = (accountSnapshotRows ?? []).map((s) => ({
    account_id: s.account_id,
    as_of: s.as_of,
    value: Number(s.value),
  }));

  const comparisons: PeriodComparison[] = ([1, 3, 12] as const).map((months) => {
    const baselineDate = monthsAgo(today, months);
    return {
      months,
      net: compareTo(summary.netWorth, netSnapshots, baselineDate),
      accounts: compareAccounts(
        valuedAccounts.map((a) => ({ id: a.id, value: a.value })),
        allAccountSnapshots,
        baselineDate,
      ),
      daysUntil: daysUntilComparable(netSnapshots, today, months),
    };
  });

  const accountNames = Object.fromEntries(
    valuedAccounts.map((a) => [a.id, a.name]),
  );

  // Today's point may not be written yet; the writer below fills it in.
  const recordedToday = netSnapshots.some((s) => s.as_of === today);
  const snapshotAccounts = valuedAccounts
    .filter((a): a is typeof a & { value: number } => a.value !== null)
    .map((a) => ({ id: a.id, value: a.value, basis: a.basis }));

  const donutData = summary.byKind.map((k, i) => ({
    name: k.label,
    value: k.value,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const assetShare =
    summary.totalAssets + summary.totalLiabilities > 0
      ? (summary.totalAssets / (summary.totalAssets + summary.totalLiabilities)) * 100
      : 100;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{household?.name ?? "משק בית"}</p>
        {hasAutoPriced && (
          <MarketRefresher
            fetchedAt={newestFetch}
            staleAfterHours={STALE_AFTER_HOURS}
            hasUnpriced={hasUnpriced}
            lastUpdated={
              newestFetch
                ? new Intl.DateTimeFormat("he-IL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(newestFetch))
                : null
            }
          />
        )}
      </header>

      {/* Hero */}
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">שווי נקי</p>
          <p
            className={cn(
              "mt-1 text-4xl font-bold tabular-nums",
              summary.netWorth < 0 && "text-destructive",
            )}
          >
            {formatILS(summary.netWorth)}
          </p>
          {netDiff !== null && netDiff !== 0 && (
            <p
              className={cn(
                "mt-2 flex items-center justify-center gap-1 text-sm font-medium",
                netDiff >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {netDiff >= 0 ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )}
              {formatILS(Math.abs(netDiff))} מהחודש הקודם
            </p>
          )}
          {summary.hasEstimates && (
            <p className="mt-2 text-xs text-muted-foreground">
              חלק מהערכים מוערכים לפי תשואות שפורסמו
            </p>
          )}
        </CardContent>
      </Card>

      {/* Assets vs liabilities */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4 text-primary" />
            נכסים מול התחייבויות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: `${assetShare}%` }} />
            <div className="bg-destructive" style={{ width: `${100 - assetShare}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <div>
              <p className="text-xs text-muted-foreground">נכסים</p>
              <p className="font-semibold tabular-nums text-success">
                {formatILS(summary.totalAssets)}
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs text-muted-foreground">התחייבויות</p>
              <p className="font-semibold tabular-nums text-destructive">
                {formatILS(summary.totalLiabilities)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="mt-4 animate-in fade-in duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" />
              תובנות
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {insights.map((ins) => (
              <InsightRow key={ins.id} insight={ins} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Allocation + liquidity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">התפלגות נכסים</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut data={donutData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4 text-primary" />
              פירוט לפי סוג
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {summary.byKind.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                אין עדיין נכסים
              </p>
            ) : (
              summary.byKind.map((k, i) => (
                <div key={k.kind} className="flex items-center gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      background: `var(--${CHART_COLORS[i % CHART_COLORS.length]})`,
                    }}
                  />
                  <span className="flex-1 truncate text-sm">{k.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Math.round(k.share * 100)}%
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatILS(k.value)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress over time */}
      <ComparisonCard comparisons={comparisons} accountNames={accountNames} />

      {/* Records today's point so next month has something to compare to. */}
      <SnapshotWriter
        accounts={snapshotAccounts}
        totals={{
          assets: summary.totalAssets,
          liabilities: summary.totalLiabilities,
          net: summary.netWorth,
        }}
        alreadyRecordedToday={recordedToday}
      />

      {/* Trend */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">מגמת הון עצמי (6 חודשים)</CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthTrend
            data={trend.map((p) => ({ label: monthLabel(p.month), net: p.net }))}
          />
        </CardContent>
      </Card>

      <PortfolioPanel
        householdId={householdId}
        members={members ?? []}
        accounts={valuedAccounts}
        liabilities={valuedLiabilities}
        accountSeeds={accounts.map((a) => ({
          id: a.id,
          kind: a.kind,
          owner_profile_id: a.owner_profile_id,
          currency: a.currency,
          fund_id: a.fund_id,
          fund_source: a.fund_source,
          // Whether returns are actually cached for this fund, and how far
          // they run — "no yields" and "yields older than your balance date"
          // look identical on screen but mean completely different things.
          fundYieldCount:
            a.fund_id !== null && a.fund_source
              ? (yieldsByFund.get(`${a.fund_source}:${a.fund_id}`) ?? []).length
              : 0,
          latestYieldPeriod:
            a.fund_id !== null && a.fund_source
              ? ((yieldsByFund.get(`${a.fund_source}:${a.fund_id}`) ?? []).reduce<
                  number | null
                >((max, y) => (max === null || y.report_period > max ? y.report_period : max), null))
              : null,
          holdings: (holdingsBy.get(a.id) ?? []).map((h) => ({
            symbol: h.symbol,
            quantity: Number(h.quantity),
            market: h.market,
          })),
          latestValuation: (() => {
            const list = valuationsBy.get(a.id) ?? [];
            const newest = list.reduce<(typeof list)[number] | null>(
              (best, v) => (!best || v.as_of > best.as_of ? v : best),
              null,
            );
            return newest ? { value: Number(newest.value), as_of: newest.as_of } : null;
          })(),
          trades: (tradesBy.get(a.id) ?? []).map((t) => ({
            id: t.id,
            symbol: t.symbol,
            market: t.market as "us" | "tase" | "crypto",
            side: t.side as "buy" | "sell",
            quantity: Number(t.quantity),
            price_per_unit: Number(t.price_per_unit),
            currency: t.currency,
            fee: Number(t.fee),
            occurred_on: t.occurred_on,
            is_opening: t.is_opening,
          })),
          flows: (flowsBy.get(a.id) ?? []).map((f) => ({
            id: f.id,
            occurred_on: f.occurred_on,
            amount: Number(f.amount),
            note: f.note,
          })),
          rules: (rulesBy.get(a.id) ?? []).map((r) => ({
            id: r.id,
            amount: Number(r.amount),
            day_of_month: r.day_of_month,
            start_month: r.start_month,
            end_month: r.end_month,
            note: r.note,
          })),
        }))}
        liabilitySeeds={liabilities.map((l) => ({
          id: l.id,
          kind: l.kind,
          owner_profile_id: l.owner_profile_id,
          principal: Number(l.principal),
          annual_rate: Number(l.annual_rate),
          term_months: Number(l.term_months),
          start_date: l.start_date,
          payment_amount: l.payment_amount === null ? null : Number(l.payment_amount),
          linkage: l.linkage,
          balance_override:
            l.balance_override === null ? null : Number(l.balance_override),
          balance_override_as_of: l.balance_override_as_of,
          loan_type: l.loan_type ?? "spitzer",
          grace_months: Number(l.grace_months ?? 0),
          capitalize_interest: l.capitalize_interest ?? false,
          rate_type: l.rate_type ?? "fixed",
          prime_margin: Number(l.prime_margin ?? 0),
        }))}
        primeRate={primeRate}
      />
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const { tone } = insight;
  const chip =
    tone === "warning"
      ? "bg-destructive/10 text-destructive"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-primary/10 text-primary";
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          chip,
        )}
      >
        {tone === "warning" ? (
          <AlertTriangle className="size-4" />
        ) : tone === "success" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Lightbulb className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{insight.title}</p>
        <p className="text-sm text-muted-foreground">{insight.text}</p>
      </div>
    </div>
  );
}
