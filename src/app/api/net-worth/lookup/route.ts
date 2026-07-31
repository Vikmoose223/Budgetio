/**
 * Resolves whatever the user typed into a symbol the price APIs accept, and
 * returns a price so the choice can be confirmed before saving.
 *
 * Server-side because both upstreams block browser requests (CORS), and
 * because crypto needs a CoinGecko **id** rather than the ticker people know:
 * "XRP" has to become "ripple" or nothing will ever price.
 *
 * With `?date=YYYY-MM-DD` it returns the price on that day instead of today's,
 * so a purchase can be costed from its date rather than typed from memory.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchCoins,
  lookupEquity,
  fetchCoinPrices,
  fetchHistoricalPrice,
} from "@/lib/networth/sources/prices";
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
  const date = searchParams.get("date");

  if (query.length < 1) return NextResponse.json({ matches: [] });

  // --- Price on a specific date ------------------------------------------
  // `q` is an already-resolved symbol here, not a search term.
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const historical = await fetchHistoricalPrice(
      query,
      market === "crypto" ? "crypto" : market === "tase" ? "tase" : "us",
      date,
    );
    return NextResponse.json({ historical });
  }

  // --- Search --------------------------------------------------------------
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
