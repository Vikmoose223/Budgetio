"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
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
  hasUnpriced = false,
}: {
  /** ISO timestamp of the newest cached price, or null if never fetched. */
  fetchedAt: string | null;
  staleAfterHours: number;
  lastUpdated: string | null;
  /** True when something is held but has no price — always worth a fetch. */
  hasUnpriced?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const firedFor = useRef<string | null>(null);

  /** The network call on its own — no state, so it's safe to run from an effect. */
  const doRefresh = useCallback(
    async (announce = false) => {
      try {
        const res = await fetch("/api/net-worth/refresh", { method: "POST" });
        if (!res.ok) return;
        if (announce) {
          const data = await res.json().catch(() => null);
          if (data?.fundErrors?.length) {
            toast.error(data.fundErrors.join(" · "), { duration: 12000 });
          } else if (data?.yields > 0) {
            toast.success(`נמשכו ${data.yields} חודשי תשואה`);
          }
        }
        router.refresh();
      } catch {
        // Offline or the endpoint is down — cached values stay on screen.
      }
    },
    [router],
  );

  useEffect(() => {
    // A symbol we hold but have no price for must be fetched regardless of how
    // fresh the rest of the cache is. Without this, adding a new holding to an
    // account that already had priced ones left it permanently unpriced: the
    // cache looked current, so nothing ever went and asked for the new symbol.
    const stale =
      fetchedAt === null ||
      // Staleness is decided here rather than during render: reading the clock
      // is impure, so it can't happen on the server or in a render pass.
      Date.now() - new Date(fetchedAt).getTime() > staleAfterHours * 3_600_000;

    if (!stale && !hasUnpriced) return;

    // Guard per *reason*, not per mount: router.refresh() reuses this same
    // component instance, so a mount-scoped flag would block the retry that a
    // freshly-added holding needs.
    const reason = `${hasUnpriced ? "unpriced" : "stale"}:${fetchedAt ?? "none"}`;
    if (firedFor.current === reason) return;
    firedFor.current = reason;

    // Background refresh: intentionally silent, so no spinner state here.
    void doRefresh(false);
  }, [fetchedAt, staleAfterHours, hasUnpriced, doRefresh]);

  async function manualRefresh() {
    setBusy(true);
    await doRefresh(true);
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
