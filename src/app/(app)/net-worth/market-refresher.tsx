"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Keeps market data current without a cron job or any stored secret.
 *
 * The page always renders instantly from the cache; if that cache is stale
 * this fires a background refresh and re-renders when it lands. There's also a
 * manual button, because "is this number actually current?" is the first thing
 * you want to be able to force.
 */
export function MarketRefresher({
  fetchedAt,
  staleAfterHours,
  lastUpdated,
}: {
  /** ISO timestamp of the newest cached price, or null if never fetched. */
  fetchedAt: string | null;
  staleAfterHours: number;
  lastUpdated: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fired = useRef(false);

  /** The network call on its own — no state, so it's safe to run from an effect. */
  const doRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/net-worth/refresh", { method: "POST" });
      if (res.ok) router.refresh();
    } catch {
      // Offline or the endpoint is down — cached values stay on screen.
    }
  }, [router]);

  useEffect(() => {
    // Staleness is decided here rather than during render: reading the clock
    // is impure, so it can't happen on the server or in a render pass.
    if (fired.current) return;
    const stale =
      fetchedAt === null ||
      Date.now() - new Date(fetchedAt).getTime() > staleAfterHours * 3_600_000;
    if (!stale) return;
    fired.current = true;
    // Background refresh: intentionally silent, so no spinner state here.
    void doRefresh();
  }, [fetchedAt, staleAfterHours, doRefresh]);

  async function manualRefresh() {
    setBusy(true);
    await doRefresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      {lastUpdated && (
        <span className="text-xs text-muted-foreground">עודכן {lastUpdated}</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={manualRefresh}
        disabled={busy}
        aria-label="רענון נתוני שוק"
      >
        <RefreshCw className={cn("size-4", busy && "animate-spin")} />
      </Button>
    </div>
  );
}
