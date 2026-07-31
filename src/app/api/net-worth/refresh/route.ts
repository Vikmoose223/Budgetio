/**
 * Refreshes the market-data caches: quotes for held symbols, FX, CPI, and
 * published fund returns for linked pension/gemel accounts.
 *
 * Runs under the caller's own Supabase session, so no service-role key is
 * needed anywhere in the deployment. Every source failure degrades quietly —
 * a stale cached value is far better than an asset vanishing from net worth.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { fetchQuote, fetchCoinPrices } from "@/lib/networth/sources/prices";
import { fetchFxRates } from "@/lib/networth/sources/fx";
import { fetchCpi } from "@/lib/networth/sources/cpi";
import { fetchFundHistory } from "@/lib/networth/sources/gemelnet";
import type { FundSource } from "@/lib/networth/sources/gemelnet";
import { fxTableFrom } from "@/lib/networth/currency";
import { priceIndex, valueAccount } from "@/lib/networth/value";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) {
    return NextResponse.json({ error: "no household" }, { status: 400 });
  }

  const asOf = todayISO();
  const result = { prices: 0, fx: 0, cpi: 0, yields: 0 };

  // --- What does this household actually hold? -----------------------------
  const { data: accounts } = await supabase
    .from("asset_accounts")
    .select("id, fund_id, fund_source")
    .eq("household_id", profile.household_id)
    .eq("archived", false);

  const accountIds = (accounts ?? []).map((a) => a.id);
  // Typed explicitly: the empty-array branch would otherwise infer `never[]`.
  type HoldingDbRow = {
    account_id: string;
    symbol: string;
    quantity: number;
    market: string;
  };
  const holdings: HoldingDbRow[] = accountIds.length
    ? ((
        await supabase
          .from("holdings")
          .select("account_id, symbol, quantity, market")
          .in("account_id", accountIds)
      ).data ?? [])
    : [];

  // --- Quotes --------------------------------------------------------------
  const equities = holdings.filter((h) => h.market !== "crypto");
  const coins = holdings.filter((h) => h.market === "crypto");

  // Deduplicate: two accounts may hold the same ticker.
  const uniqueEquities = [
    ...new Map(equities.map((h) => [`${h.market}:${h.symbol}`, h])).values(),
  ];
  const quotes = await Promise.all(
    uniqueEquities.map((h) => fetchQuote(h.symbol, h.market as "us" | "tase", asOf)),
  );

  const coinIds = [...new Set(coins.map((c) => c.symbol.toLowerCase()))];
  const coinRows = await fetchCoinPrices(coinIds, asOf);

  const priceRows = [...quotes.filter((q) => q !== null), ...coinRows];

  // Report what we couldn't price so the UI can say so out loud. A symbol that
  // silently never gets a price is indistinguishable from a broken feature.
  const pricedCoins = new Set(coinRows.map((r) => r.symbol.toLowerCase()));
  const failed = [
    ...uniqueEquities.filter((_, i) => quotes[i] === null).map((h) => h.symbol),
    ...coinIds.filter((id) => !pricedCoins.has(id)),
  ];
  if (priceRows.length > 0) {
    // Store under the symbol we asked for, not the one the API echoed back.
    const { error } = await supabase.from("price_cache").upsert(
      priceRows.map((p) => ({
        symbol: p.symbol,
        market: p.market,
        as_of: p.as_of,
        price: p.price,
        currency: p.currency,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "symbol,market,as_of" },
    );
    if (!error) result.prices = priceRows.length;
  }

  // --- FX ------------------------------------------------------------------
  const fxRows = await fetchFxRates();
  if (fxRows.length > 0) {
    const { error } = await supabase
      .from("fx_rates")
      .upsert(fxRows, { onConflict: "base,quote,as_of" });
    if (!error) result.fx = fxRows.length;
  }

  // --- Snapshot the priced accounts ---------------------------------------
  // Without this the net-worth trend has nothing to plot: historical market
  // prices aren't available, so each refresh records today's value as a point
  // and the chart fills in over time.
  const { data: allFx } = await supabase.from("fx_rates").select("base, quote, rate");
  const fx = fxTableFrom(allFx ?? []);
  const priced = priceIndex(
    priceRows.map((p) => ({
      symbol: p.symbol,
      market: p.market,
      price: p.price,
      currency: p.currency,
      as_of: p.as_of,
    })),
  );

  const holdingsByAccount = new Map<string, HoldingDbRow[]>();
  for (const h of holdings) {
    const list = holdingsByAccount.get(h.account_id);
    if (list) list.push(h);
    else holdingsByAccount.set(h.account_id, [h]);
  }

  const snapshots: { account_id: string; as_of: string; value: number; source: "auto" }[] =
    [];
  for (const [accountId, rows] of holdingsByAccount) {
    const valued = valueAccount({
      account: {
        id: accountId,
        name: "",
        kind: "brokerage",
        owner_profile_id: null,
        currency: "ILS",
        fund_id: null,
        fund_source: null,
      },
      holdings: rows.map((h) => ({
        symbol: h.symbol,
        quantity: Number(h.quantity),
        market: h.market as "us" | "tase" | "crypto",
      })),
      prices: priced,
      valuations: [],
      flows: [],
      yields: [],
      fx,
      asOf,
    });
    // Only record a genuine live valuation, never a fallback or a partial one.
    if (valued.basis === "holdings" && valued.value !== null) {
      snapshots.push({
        account_id: accountId,
        as_of: asOf,
        value: valued.value,
        source: "auto",
      });
    }
  }

  if (snapshots.length > 0) {
    // Snapshots go to their own table, never to `valuations`. A valuation is
    // the anchor a pension balance drifts forward from — writing computed
    // estimates there would make tomorrow's drift compound on top of today's
    // estimate instead of on the balance the user actually entered.
    await supabase.from("account_snapshots").upsert(
      snapshots.map((s) => ({
        account_id: s.account_id,
        as_of: s.as_of,
        value: s.value,
        basis: "holdings",
      })),
      { onConflict: "account_id,as_of" },
    );
  }

  // --- CPI (only needed when something is index-linked) --------------------
  const { data: linked } = await supabase
    .from("liabilities")
    .select("id")
    .eq("household_id", profile.household_id)
    .eq("linkage", "cpi")
    .limit(1);

  if (linked && linked.length > 0) {
    const cpiRows = await fetchCpi(180);
    if (cpiRows.length > 0) {
      const { error } = await supabase
        .from("cpi_index")
        .upsert(cpiRows, { onConflict: "period" });
      if (!error) result.cpi = cpiRows.length;
    }
  }

  // --- Published fund returns ---------------------------------------------
  const funds = (accounts ?? []).filter(
    (a): a is typeof a & { fund_id: number; fund_source: FundSource } =>
      a.fund_id !== null && a.fund_source !== null,
  );
  const uniqueFunds = [
    ...new Map(funds.map((f) => [`${f.fund_source}:${f.fund_id}`, f])).values(),
  ];

  for (const fund of uniqueFunds) {
    const rows = await fetchFundHistory(fund.fund_id, fund.fund_source, 36);
    if (rows.length === 0) continue;
    const { error } = await supabase
      .from("fund_yields_cache")
      .upsert(rows, { onConflict: "fund_id,source,report_period" });
    if (!error) result.yields += rows.length;
  }

  return NextResponse.json({ ok: true, asOf, ...result, failed });
}
