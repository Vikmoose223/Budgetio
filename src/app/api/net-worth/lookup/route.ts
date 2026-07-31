/**
 * Resolves whatever the user typed into a symbol the price APIs accept, and
 * returns a current price so the choice can be confirmed before saving.
 *
 * Server-side because both upstreams block browser requests (CORS), and
 * because crypto needs a CoinGecko **id** rather than the ticker people know:
 * "XRP" has to become "ripple" or nothing will ever price.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCoins, lookupEquity, fetchCoinPrices } from "@/lib/networth/sources/prices";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const market = searchParams.get("market") ?? "us";

  if (query.length < 1) return NextResponse.json({ matches: [] });

  if (market === "crypto") {
    const matches = await searchCoins(query);
    if (matches.length === 0) return NextResponse.json({ matches: [] });

    // Price the candidates in one call so each option shows a real number.
    const prices = await fetchCoinPrices(
      matches.map((m) => m.symbol),
      todayISO(),
    );
    const priceBySymbol = new Map(prices.map((p) => [p.symbol, p]));

    return NextResponse.json({
      matches: matches.map((m) => {
        const p = priceBySymbol.get(m.symbol);
        return { ...m, price: p?.price ?? null, currency: p?.currency ?? null };
      }),
    });
  }

  const matches = await lookupEquity(query, market === "tase" ? "tase" : "us");
  return NextResponse.json({ matches });
}
