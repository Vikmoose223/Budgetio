/**
 * Records today's value for every account plus the household total.
 *
 * History can't be reconstructed later — there's no source for what a pension
 * was worth last month, and free price feeds don't serve historical quotes. So
 * the only way to have a comparison in a month's time is to start writing
 * points now.
 *
 * The numbers are posted by the page rather than recomputed here: the page has
 * already run the full valuation (prices, FX, drift, loan schedules), and
 * duplicating that pipeline server-side would be a second implementation to
 * keep in sync. RLS still confines every write to the caller's own household.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

type Body = {
  accounts?: { id: string; value: number; basis: string }[];
  totals?: { assets: number; liabilities: number; net: number };
};

export async function POST(request: Request) {
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const asOf = todayISO();

  // Only accounts that belong to this household, whatever was posted.
  const { data: owned } = await supabase
    .from("asset_accounts")
    .select("id")
    .eq("household_id", profile.household_id);
  const ownedIds = new Set((owned ?? []).map((a) => a.id));

  const rows = (body.accounts ?? [])
    .filter((a) => ownedIds.has(a.id) && Number.isFinite(Number(a.value)))
    .map((a) => ({
      account_id: a.id,
      as_of: asOf,
      value: Number(a.value),
      basis: typeof a.basis === "string" ? a.basis : "anchor",
    }));

  if (rows.length > 0) {
    await supabase
      .from("account_snapshots")
      .upsert(rows, { onConflict: "account_id,as_of" });
  }

  const totals = body.totals;
  if (totals && Number.isFinite(Number(totals.net))) {
    await supabase.from("net_worth_snapshots").upsert(
      {
        household_id: profile.household_id,
        as_of: asOf,
        total_assets: Number(totals.assets) || 0,
        total_liabilities: Number(totals.liabilities) || 0,
        net_worth: Number(totals.net) || 0,
      },
      { onConflict: "household_id,as_of" },
    );
  }

  return NextResponse.json({ ok: true, asOf, accounts: rows.length });
}
