/**
 * Fund search over גמל-נט / פנסיה-נט.
 *
 * The app needs the dataset's internal FUND_ID to fetch a fund's published
 * returns, but nobody knows that number — the one on your statement is a
 * policy or member number. So funds are found by name and the id is resolved
 * behind the scenes.
 *
 * Server-side because data.gov.il doesn't send CORS headers.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchFunds, type FundSource } from "@/lib/networth/sources/gemelnet";

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
  const rawSource = searchParams.get("source");
  const source: FundSource = rawSource === "pension" ? "pension" : "gemel";

  if (query.length < 2) return NextResponse.json({ funds: [] });

  const funds = await searchFunds(query, source);
  // Plenty for a picker; the full result set is every month of every match.
  return NextResponse.json({ funds: funds.slice(0, 25) });
}
