"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { workbookToMatrix } from "@/lib/import/read-workbook";
import {
  parseRows,
  externalId,
  foreignLabel,
  type ParsedRow,
} from "@/lib/import/parse";
import {
  suggestCategory,
  type NamedCategory,
  type SuggestionSource,
} from "@/lib/import/categorize";
import { findDuplicates, type DupExisting } from "@/lib/dedup";
import { categoryIconElement, categoryTintStyle } from "@/lib/categories";
import { formatILS, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Upload, Loader2, FileSpreadsheet, RotateCcw } from "lucide-react";

type Category = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: "expense" | "saving";
};
type Rule = { keyword: string; category_id: string };

// How to resolve a fuzzy (name+date+amount) match against an existing expense.
type Resolution = "keep" | "replace" | "skip";

type ReviewRow = {
  key: string;
  parsed: ParsedRow;
  externalId: string;
  categoryId: string | null;
  source: SuggestionSource;
  duplicate: boolean; // exact re-import (external_id already in DB) — auto-skipped
  possibleDup: DupExisting | null; // same name+date+amount as an existing row
  resolution: Resolution; // only meaningful when possibleDup != null
  include: boolean; // for normal (non-duplicate) rows
};

export function ImportView({
  householdId,
  userId,
  categories,
  rules,
}: {
  householdId: string;
  userId: string;
  categories: Category[];
  rules: Rule[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"upload" | "review">("upload");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const matrix = workbookToMatrix(await file.arrayBuffer());
      const parsed = parseRows(matrix);
      if (parsed.rows.length === 0) {
        setError("לא נמצאו עסקאות בקובץ.");
        return;
      }

      const categoriesByName = new Map<string, NamedCategory>(
        categories.map((c) => [c.name, { id: c.id, name: c.name, kind: c.kind }]),
      );

      const supabase = createClient();

      // Exact re-imports: rows whose external_id already exists (auto-skipped).
      const ids = parsed.rows.map(externalId);
      const { data: existing } = await supabase
        .from("transactions")
        .select("external_id")
        .eq("household_id", householdId)
        .in("external_id", ids);
      const existingIds = new Set((existing ?? []).map((e) => e.external_id));

      // Fuzzy matches: pull existing expenses on the same dates as the import
      // so we can flag same name+date+amount rows the external_id key missed
      // (differing/absent bank reference, or a manual entry).
      const dates = [...new Set(parsed.rows.map((p) => p.occurredOn))];
      const { data: sameDate } = await supabase
        .from("transactions")
        .select("id, occurred_on, amount, merchant, description")
        .eq("household_id", householdId)
        .in("occurred_on", dates);
      const existingByDate: DupExisting[] = (sameDate ?? []).map((e) => ({
        id: e.id,
        occurred_on: e.occurred_on,
        amount: Number(e.amount),
        merchant: e.merchant,
        description: e.description,
      }));

      const review: ReviewRow[] = parsed.rows.map((p, i) => {
        const ext = externalId(p);
        const s = suggestCategory(p, { rules, categoriesByName });
        const duplicate = existingIds.has(ext);
        // Only fuzzy-check rows that aren't already exact duplicates.
        const possibleDup = duplicate
          ? null
          : (findDuplicates(
              { occurredOn: p.occurredOn, amount: p.amount, name: p.merchant },
              existingByDate,
            )[0] ?? null);
        return {
          key: `${i}-${ext}`,
          parsed: p,
          externalId: ext,
          categoryId: s.categoryId,
          source: s.source,
          duplicate,
          possibleDup,
          resolution: "skip",
          include: !duplicate && !possibleDup,
        };
      });

      setRows(review);
      setFileName(file.name);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "קריאת הקובץ נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  function setCategory(key: string, categoryId: string | null) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, categoryId } : r)),
    );

    // Offer to apply the same category to the merchant's other rows in this
    // import (it's also learned for future imports on approval).
    const changed = rows.find((r) => r.key === key);
    if (!changed || !categoryId) return;
    const merchant = changed.parsed.merchant;
    const others = rows.filter(
      (r) =>
        r.key !== key &&
        !r.duplicate &&
        r.parsed.merchant === merchant &&
        r.categoryId !== categoryId,
    );
    if (others.length === 0) return;

    const catName = categories.find((c) => c.id === categoryId)?.name ?? "";
    toast(`להחיל "${catName}" על עוד ${others.length} עסקאות של "${merchant}"?`, {
      duration: 8000,
      action: {
        label: "כן, החל על הכול",
        onClick: () =>
          setRows((rs) =>
            rs.map((r) =>
              !r.duplicate && r.parsed.merchant === merchant
                ? { ...r, categoryId }
                : r,
            ),
          ),
      },
    });
  }
  function toggleInclude(key: string) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, include: !r.include } : r)),
    );
  }
  function setResolution(key: string, resolution: Resolution) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, resolution } : r)),
    );
  }

  // Normal rows (no duplicate of any kind) chosen for insert.
  const normalIncluded = rows.filter(
    (r) => !r.duplicate && !r.possibleDup && r.include,
  );
  // Fuzzy matches the user chose to keep as a second copy → also inserted.
  const keepBoth = rows.filter((r) => r.possibleDup && r.resolution === "keep");
  const toInsert = [...normalIncluded, ...keepBoth];
  // Fuzzy matches the user chose to overwrite the existing row with.
  const toReplace = rows.filter(
    (r) => r.possibleDup && r.resolution === "replace",
  );

  const exactDupCount = rows.filter((r) => r.duplicate).length;
  const possibleDupCount = rows.filter((r) => r.possibleDup).length;
  const uncategorized = toInsert.filter((r) => !r.categoryId).length;
  const includedTotal = toInsert.reduce((s, r) => s + r.parsed.amount, 0);
  const actionCount = toInsert.length + toReplace.length;

  // Row → transaction column values (shared by insert and replace).
  function rowValues(r: ReviewRow) {
    return {
      category_id: r.categoryId,
      occurred_on: r.parsed.occurredOn,
      amount: r.parsed.amount,
      // For foreign charges, keep the original amount visible in the title.
      description:
        r.parsed.currency && r.parsed.originalAmount
          ? `${r.parsed.merchant} · ${foreignLabel(r.parsed.currency, r.parsed.originalAmount)}`
          : r.parsed.merchant,
      merchant: r.parsed.merchant,
      source: "import" as const,
      external_id: r.externalId,
    };
  }

  async function commit() {
    if (actionCount === 0) {
      toast.error("אין עסקאות חדשות לשמור.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      // Insert new rows (normal + "keep both" fuzzy matches). The DB's unique
      // index on (household_id, external_id) is a final guard against exact dups.
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("transactions").insert(
          toInsert.map((r) => ({
            ...rowValues(r),
            household_id: householdId,
            created_by: userId,
          })),
        );
        if (insErr) throw insErr;
      }

      // Replace: overwrite the matched existing rows in place (keeps one copy).
      if (toReplace.length > 0) {
        const results = await Promise.all(
          toReplace.map((r) =>
            supabase
              .from("transactions")
              .update(rowValues(r))
              .eq("id", r.possibleDup!.id),
          ),
        );
        const failed = results.find((res) => res.error);
        if (failed?.error) throw failed.error;
      }

      // Learn merchant → category so future imports auto-categorize (memory).
      const learned = new Map<string, string>();
      for (const r of [...toInsert, ...toReplace]) {
        if (r.categoryId) learned.set(r.parsed.merchant, r.categoryId);
      }
      if (learned.size > 0) {
        await supabase.from("category_rules").upsert(
          [...learned].map(([keyword, category_id]) => ({
            household_id: householdId,
            keyword,
            category_id,
          })),
          { onConflict: "household_id,keyword" },
        );
      }

      const parts = [
        toInsert.length > 0 ? `${toInsert.length} נשמרו` : null,
        toReplace.length > 0 ? `${toReplace.length} הוחלפו` : null,
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "הייבוא הושלם");
      router.push("/transactions");
      router.refresh();
    } catch {
      toast.error("שמירת הייבוא נכשלה. נסו שוב.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">ייבוא מהבנק</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          העלו קובץ פירוט עסקאות (Excel/CSV), נסווג אוטומטית, ותאשרו לפני שמירה.
        </p>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stage === "upload" && (
        <label
          className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center transition-colors hover:bg-accent/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            {busy ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Upload className="size-6" />
            )}
          </div>
          <div>
            <p className="font-medium">
              {busy ? "קורא את הקובץ…" : "בחרו קובץ או גררו לכאן"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              נתמכים: xlsx, xls, csv
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {stage === "review" && (
        <>
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <FileSpreadsheet className="size-4 text-primary" />
                {fileName}
              </span>
              <span className="text-muted-foreground">
                {toInsert.length} לשמירה · {formatILS(includedTotal)}
              </span>
              {toReplace.length > 0 && (
                <span className="text-primary">{toReplace.length} להחלפה</span>
              )}
              {possibleDupCount > 0 && (
                <span className="text-warning">
                  {possibleDupCount} כפילויות אפשריות
                </span>
              )}
              {exactDupCount > 0 && (
                <span className="text-muted-foreground">
                  {exactDupCount} כבר קיימות
                </span>
              )}
              {uncategorized > 0 && (
                <span className="text-warning">{uncategorized} לא מסווגות</span>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <ReviewCard
                key={r.key}
                row={r}
                categories={categories}
                category={r.categoryId ? catById.get(r.categoryId) : undefined}
                onCategory={(id) => setCategory(r.key, id)}
                onToggle={() => toggleInclude(r.key)}
                onResolution={(res) => setResolution(r.key, res)}
              />
            ))}
          </div>

          <div className="sticky bottom-4 mt-5 flex gap-2">
            <Button onClick={commit} disabled={busy} size="lg" className="flex-1 shadow-lg">
              {busy && <Loader2 className="size-4 animate-spin" />}
              אישור ושמירה ({actionCount})
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => {
                setStage("upload");
                setRows([]);
                setError(null);
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: "skip", label: "דלג" },
  { value: "replace", label: "החלף" },
  { value: "keep", label: "שמור שניהם" },
];

function ReviewCard({
  row,
  categories,
  category,
  onCategory,
  onToggle,
  onResolution,
}: {
  row: ReviewRow;
  categories: Category[];
  category?: Category;
  onCategory: (id: string | null) => void;
  onToggle: () => void;
  onResolution: (res: Resolution) => void;
}) {
  const { parsed, duplicate, possibleDup, resolution, include } = row;
  // A possible-dup row is "active" (will be saved) unless left on skip.
  const active = possibleDup
    ? resolution !== "skip"
    : !duplicate && include;
  // Show the category picker for any row that will be saved.
  const showCategory = !duplicate && (!possibleDup || resolution !== "skip");

  return (
    <Card
      className={
        possibleDup
          ? active
            ? "border-warning/60"
            : "border-warning/40 opacity-70"
          : duplicate
            ? "opacity-60"
            : active
              ? ""
              : "opacity-70"
      }
    >
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          {!duplicate && !possibleDup && (
            <input
              type="checkbox"
              checked={include}
              onChange={onToggle}
              className="size-4 accent-primary"
              aria-label="לכלול בייבוא"
            />
          )}
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={categoryTintStyle(category?.color ?? "muted-foreground")}
          >
            {categoryIconElement(category?.icon)}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {parsed.merchant}
              {parsed.currency && parsed.originalAmount && (
                <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-normal text-accent-foreground">
                  {foreignLabel(parsed.currency, parsed.originalAmount)}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(parsed.occurredOn)}
              {parsed.rawCategory ? ` · ${parsed.rawCategory}` : ""}
            </p>
            {showCategory && (
              <select
                value={row.categoryId ?? ""}
                onChange={(e) => onCategory(e.target.value || null)}
                className={`mt-2 h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  row.categoryId ? "border-input" : "border-warning text-warning"
                }`}
              >
                <option value="">— לא מסווג —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-semibold tabular-nums">
              {formatILS(parsed.amount)}
            </span>
            {duplicate && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                כבר קיים
              </span>
            )}
            {possibleDup && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
                כפילות אפשרית
              </span>
            )}
          </div>
        </div>

        {possibleDup && (
          <div className="rounded-lg bg-warning/10 p-2">
            <p className="mb-2 text-[11px] text-muted-foreground">
              קיימת כבר הוצאה זהה (שם, תאריך וסכום). מה לעשות?
            </p>
            <div className="flex gap-1">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onResolution(opt.value)}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                    resolution === opt.value
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
