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

type ReviewRow = {
  key: string;
  parsed: ParsedRow;
  externalId: string;
  categoryId: string | null;
  source: SuggestionSource;
  duplicate: boolean;
  include: boolean;
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

      // Find rows already imported before (dedupe by external id).
      const ids = parsed.rows.map(externalId);
      const supabase = createClient();
      const { data: existing } = await supabase
        .from("transactions")
        .select("external_id")
        .eq("household_id", householdId)
        .in("external_id", ids);
      const existingIds = new Set((existing ?? []).map((e) => e.external_id));

      const review: ReviewRow[] = parsed.rows.map((p, i) => {
        const ext = externalId(p);
        const s = suggestCategory(p, { rules, categoriesByName });
        const duplicate = existingIds.has(ext);
        return {
          key: `${i}-${ext}`,
          parsed: p,
          externalId: ext,
          categoryId: s.categoryId,
          source: s.source,
          duplicate,
          include: !duplicate,
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
  }
  function toggleInclude(key: string) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, include: !r.include } : r)),
    );
  }

  const includable = rows.filter((r) => !r.duplicate);
  const included = includable.filter((r) => r.include);
  const duplicates = rows.length - includable.length;
  const uncategorized = included.filter((r) => !r.categoryId).length;
  const includedTotal = included.reduce((s, r) => s + r.parsed.amount, 0);

  async function commit() {
    if (included.length === 0) {
      toast.error("אין עסקאות חדשות לשמור.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const payload = included.map((r) => ({
        household_id: householdId,
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
        created_by: userId,
      }));
      // Duplicates were already filtered client-side; the DB's unique index on
      // (household_id, external_id) is a final guard.
      const { error: insErr } = await supabase
        .from("transactions")
        .insert(payload);
      if (insErr) throw insErr;

      // Learn merchant → category so future imports auto-categorize (memory).
      const learned = new Map<string, string>();
      for (const r of included) {
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

      toast.success(`יובאו ${included.length} עסקאות`);
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
                {included.length} לשמירה · {formatILS(includedTotal)}
              </span>
              {duplicates > 0 && (
                <span className="text-muted-foreground">
                  {duplicates} כבר קיימות
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
              />
            ))}
          </div>

          <div className="sticky bottom-4 mt-5 flex gap-2">
            <Button onClick={commit} disabled={busy} size="lg" className="flex-1 shadow-lg">
              {busy && <Loader2 className="size-4 animate-spin" />}
              אישור ושמירה ({included.length})
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

function ReviewCard({
  row,
  categories,
  category,
  onCategory,
  onToggle,
}: {
  row: ReviewRow;
  categories: Category[];
  category?: Category;
  onCategory: (id: string | null) => void;
  onToggle: () => void;
}) {
  const { parsed, duplicate, include } = row;
  return (
    <Card className={duplicate ? "opacity-60" : include ? "" : "opacity-70"}>
      <CardContent className="flex items-center gap-3 p-3">
        {!duplicate && (
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
          {!duplicate && (
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
        </div>
      </CardContent>
    </Card>
  );
}
