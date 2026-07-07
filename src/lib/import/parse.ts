// Pure parsing logic for Israeli bank / credit-card statement exports.
// The workbook → matrix step lives in readWorkbook (client-only, uses SheetJS);
// everything here operates on a plain string matrix so it is easy to unit test.

export type ParsedRow = {
  occurredOn: string; // ISO yyyy-mm-dd
  merchant: string;
  amount: number; // positive = expense
  rawCategory: string | null; // the bank's "ענף" value
  type: string | null;
  note: string | null;
};

export type ParsedStatement = {
  rows: ParsedRow[];
  headerRow: number;
  columns: {
    date: number;
    merchant: number;
    charge: number;
    txnAmount: number;
    industry: number;
    type: number;
    note: number;
  };
  skipped: number;
};

// Strip currency symbols, thousands separators and bidi marks.
function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\r\n/g, " ")
    .trim();
}

/** Parse "₪ 1,256.00" → 1256, "" → null, refunds may be negative. */
export function parseAmount(value: unknown): number | null {
  const s = clean(value).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse a day-first date like "7/7/26" or "30/06/2026" → "2026-07-07". */
export function parseDate(value: unknown): string | null {
  const s = clean(value);
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Reject impossible dates (e.g. 31/02).
  const d = new Date(iso);
  return d.getMonth() + 1 === month && d.getDate() === day ? iso : null;
}

function findColumn(header: string[], ...needles: string[]): number {
  return header.findIndex((h) => needles.some((n) => h.includes(n)));
}

/**
 * Parse a statement given as a matrix of rows. Detects the header row by
 * looking for a merchant + date column, then reads the data rows below it.
 * Throws a friendly (Hebrew) error if the layout can't be recognized.
 */
export function parseRows(matrix: unknown[][]): ParsedStatement {
  let headerRow = -1;
  let cols: ParsedStatement["columns"] | null = null;

  for (let i = 0; i < matrix.length; i++) {
    const cells = (matrix[i] ?? []).map(clean);
    const merchant = findColumn(cells, "בית עסק", "תיאור", "שם העסק");
    const date = findColumn(cells, "תאריך");
    if (merchant !== -1 && date !== -1) {
      headerRow = i;
      cols = {
        date,
        merchant,
        charge: findColumn(cells, "חיוב"),
        txnAmount: findColumn(cells, "סכום עסקה", "סכום"),
        industry: findColumn(cells, "ענף", "קטגוריה", "תחום"),
        type: findColumn(cells, "סוג"),
        note: findColumn(cells, "הער"),
      };
      break;
    }
  }

  if (headerRow === -1 || !cols) {
    throw new Error(
      "לא זוהו עמודות מתאימות בקובץ. ודאו שזהו קובץ פירוט עסקאות מהבנק/כרטיס.",
    );
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    const occurredOn = parseDate(cells[cols.date]);
    if (!occurredOn) {
      skipped++;
      continue; // title/summary/footer row
    }
    const amount =
      (cols.charge !== -1 ? parseAmount(cells[cols.charge]) : null) ??
      (cols.txnAmount !== -1 ? parseAmount(cells[cols.txnAmount]) : null);
    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }
    rows.push({
      occurredOn,
      merchant: clean(cells[cols.merchant]) || "ללא שם",
      amount,
      rawCategory: cols.industry !== -1 ? clean(cells[cols.industry]) || null : null,
      type: cols.type !== -1 ? clean(cells[cols.type]) || null : null,
      note: cols.note !== -1 ? clean(cells[cols.note]) || null : null,
    });
  }

  return { rows, headerRow, columns: cols, skipped };
}

/** Stable id for de-duplicating a row across re-imports within a household. */
export function externalId(row: ParsedRow): string {
  return `${row.occurredOn}|${row.amount.toFixed(2)}|${row.merchant}`;
}
