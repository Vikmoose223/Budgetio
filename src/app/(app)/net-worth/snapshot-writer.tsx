"use client";

import { useEffect, useRef } from "react";

/**
 * Writes today's snapshot once per day, in the background.
 *
 * Invisible by design — the payoff is a month away, and asking someone to
 * press a button daily to earn a comparison later would guarantee gaps.
 */
export function SnapshotWriter({
  accounts,
  totals,
  alreadyRecordedToday,
}: {
  accounts: { id: string; value: number; basis: string }[];
  totals: { assets: number; liabilities: number; net: number };
  alreadyRecordedToday: boolean;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (alreadyRecordedToday || fired.current) return;
    if (accounts.length === 0) return;
    fired.current = true;

    void fetch("/api/net-worth/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts, totals }),
    }).catch(() => {
      // A missed day leaves a gap in the history, which the comparison
      // tolerates by falling back to the nearest earlier point.
    });
  }, [accounts, totals, alreadyRecordedToday]);

  return null;
}
