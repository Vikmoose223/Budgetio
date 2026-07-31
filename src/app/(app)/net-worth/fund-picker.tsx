"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Check, Loader2, X } from "lucide-react";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export type FundOption = {
  fund_id: number;
  fund_name: string;
  managing_corp: string | null;
  source: "gemel" | "pension";
};

/**
 * Finds a fund by name in גמל-נט / פנסיה-נט.
 *
 * This replaces a raw "מספר קופה" box, which was unusable: the id it wanted is
 * the dataset's internal FUND_ID, and the number printed on a statement is a
 * policy number. Typing that in resolved to nothing, silently.
 */
export function FundPicker({
  fundId,
  fundName,
  fundSource,
  defaultSource = "gemel",
  onChange,
}: {
  fundId: string;
  fundName?: string;
  fundSource: "gemel" | "pension" | "";
  /** Which dataset to search first, based on the account kind. */
  defaultSource?: "gemel" | "pension";
  onChange: (v: {
    fundId: string;
    fundSource: "gemel" | "pension" | "";
    fundName?: string;
  }) => void;
}) {
  // A pension fund lives in פנסיה-נט, not גמל-נט. Defaulting to the wrong
  // dataset means the search finds nothing and looks broken.
  const [source, setSource] = useState<"gemel" | "pension">(
    fundSource === "pension" ? "pension" : fundSource === "gemel" ? "gemel" : defaultSource,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FundOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setError("הקלידו לפחות שתי אותיות.");
      return;
    }
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(
        `/api/net-worth/funds?q=${encodeURIComponent(q)}&source=${source}`,
      );
      const data = await res.json();
      const funds: FundOption[] = data.funds ?? [];
      if (funds.length === 0) {
        setError(
          source === "gemel"
            ? "לא נמצא בגמל-נט. אם זו קרן פנסיה — החליפו ל״פנסיה״ וחפשו שוב."
            : "לא נמצא בפנסיה-נט. אם זו קופת גמל או השתלמות — החליפו ל״גמל״ וחפשו שוב.",
        );
      } else {
        setResults(funds);
      }
    } catch {
      setError("החיפוש נכשל. נסו שוב.");
    } finally {
      setSearching(false);
    }
  }

  function pick(f: FundOption) {
    onChange({
      fundId: String(f.fund_id),
      fundSource: f.source,
      fundName: f.fund_name,
    });
    setResults(null);
    setQuery("");
    setError(null);
  }

  if (fundId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">קופה מקושרת</Label>
        <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
          <Check className="size-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              {fundName ?? `קופה ${fundId}`}
            </span>
            <span className="block text-xs text-muted-foreground">
              {fundSource === "pension" ? "פנסיה־נט" : "גמל־נט"} · מזהה {fundId}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange({ fundId: "", fundSource: "", fundName: undefined })}
            aria-label="ניתוק הקופה"
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          השווי יתעדכן לפי התשואות הרשמיות שמתפרסמות מדי חודש.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">חיפוש קופה (לא חובה)</Label>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as "gemel" | "pension");
            setResults(null);
          }}
          className={SELECT_CLASS}
          aria-label="מאגר"
        >
          <option value="gemel">גמל / השתלמות</option>
          <option value="pension">פנסיה</option>
        </select>
        <div className="col-span-2 flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="למשל: מיטב, הראל, אלטשולר"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={search}
            disabled={searching}
            aria-label="חיפוש קופה"
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        חפשו לפי שם הקופה — לא לפי המספר שמופיע בדוח, שהוא מספר פוליסה ולא מזהה
        הקופה במאגר.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {results && (
        <div className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-1">
          {results.map((f) => (
            <button
              key={`${f.source}:${f.fund_id}`}
              type="button"
              onClick={() => pick(f)}
              className="rounded-md px-2 py-1.5 text-right transition-colors hover:bg-accent"
            >
              <span className="block truncate text-sm">{f.fund_name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {f.managing_corp ?? ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
