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
import { AllocationDonut } from "./allocation-donut";
import { NetWorthTrend } from "./net-worth-trend";
import { PortfolioPanel } from "./portfolio-panel";
import { MarketRefresher } from "./market-refresher";
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
      .select("name, month_start_day")
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
          .select("account_id, occurred_on, amount")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("price_cache").select("symbol, market, price, currency, as_of, fetched_at"),
    supabase
      .from("fund_yields_cache")
      .select("fund_id, source, report_period, monthly_yield, avg_mgmt_fee"),
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
    });
  });

  const valuedLiabilities = liabilities.map((l) =>
    valueLiability(l, today, fx, cpiRatioAt(today, l.start_date)),
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
  const hasAutoPriced = (holdingRows ?? []).length > 0;

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
        }))}
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
