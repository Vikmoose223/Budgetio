// Pure parsing logic for Israeli bank / credit-card statement exports.
// Supports multiple layouts by detecting each header row and reading the data
// section beneath it (some exports have several sections, e.g. domestic +
// foreign purchases). The workbook → matrix step lives in readWorkbook.

export type ParsedRow = {
  occurredOn: string; // ISO yyyy-mm-dd
  merchant: string;
  amount: number; // ILS, positive = expense
  rawCategory: string | null; // the bank's "ענף" value, when present
  type: string | null;
  note: string | null;
  currency: string | null; // original currency for foreign charges (e.g. "EUR")
  originalAmount: number | null; // amount in that currency
  reference: string | null; // bank reference ("אסמכתא"), used for dedup
};

type Columns = {
  date: number;
  merchant: number;
  charge: number;
  txnAmount: number;
  industry: number;
  currency: number;
  type: number;
  note: number;
  reference: number;
};

export type ParsedStatement = {
  rows: ParsedRow[];
  sections: number;
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

/**
 * Parse a date: a day-first string ("7/7/26", "30/06/2026") or an Excel serial
 * number ("46205" = days since 1899-12-30). Returns ISO or null.
 */
export function parseDate(value: unknown): string | null {
  const s = clean(value);

  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(iso);
    return d.getMonth() + 1 === month && d.getDate() === day ? iso : null;
  }

  // Excel serial date — bare integer in the modern-date range (~1990..2080).
  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial >= 32000 && serial <= 66000) {
      const d = new Date(Math.round((serial - 25569) * 86400000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
  }

  return null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function firstMatch(cells: string[], needles: string[]): number {
  return cells.findIndex((h) => needles.some((n) => h.includes(n)));
}

// The transaction date, not the billing date ("חיוב לתאריך").
function findDateColumn(cells: string[]): number {
  let i = cells.findIndex(
    (h) =>
      /תאריך/.test(h) &&
      !/חיוב/.test(h) &&
      (h === "תאריך" || h.includes("עסקה") || h.includes("רכישה")),
  );
  if (i === -1) i = cells.findIndex((h) => /תאריך/.test(h) && !/חיוב/.test(h));
  if (i === -1) i = cells.findIndex((h) => /תאריך/.test(h));
  return i;
}

function mapColumns(cells: string[]): Columns {
  return {
    date: findDateColumn(cells),
    merchant: firstMatch(cells, ["בית עסק", "תיאור", "שם העסק"]),
    // ILS charge column = has both "סכום" and "חיוב".
    charge: cells.findIndex((h) => h.includes("סכום") && h.includes("חיוב")),
    // purchase amount (may be the original foreign amount)
    txnAmount: cells.findIndex(
      (h) =>
        h.includes("סכום") &&
        (h.includes("עסקה") || h.includes("קנייה") || h.includes("רכישה")),
    ),
    industry: firstMatch(cells, ["ענף", "קטגוריה", "תחום"]),
    currency: firstMatch(cells, ["מטבע"]),
    type: firstMatch(cells, ["סוג עסק", "סוג"]),
    note: firstMatch(cells, ["הער"]),
    reference: firstMatch(cells, ["אסמכתא", "מספר עסקה"]),
  };
}

function isHeaderRow(cols: Columns): boolean {
  return cols.merchant !== -1 && cols.date !== -1;
}

function isIls(currency: string): boolean {
  return currency === "" || /ש"?ח|שח|ils|nis|₪/i.test(currency);
}

/**
 * Parse a statement matrix. Finds every header row and reads the data section
 * under it (until the next header), so multi-section exports work. Throws a
 * friendly Hebrew error if no header is recognized.
 */
export function parseRows(matrix: unknown[][]): ParsedStatement {
  const headers: { row: number; cols: Columns }[] = [];
  for (let i = 0; i < matrix.length; i++) {
    const cells = (matrix[i] ?? []).map(clean);
    const cols = mapColumns(cells);
    if (isHeaderRow(cols)) headers.push({ row: i, cols });
  }

  if (headers.length === 0) {
    throw new Error(
      "לא זוהו עמודות מתאימות בקובץ. ודאו שזהו קובץ פירוט עסקאות מהבנק/כרטיס.",
    );
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (let h = 0; h < headers.length; h++) {
    const { row: headerRow, cols } = headers[h];
    const sectionEnd = headers[h + 1]?.row ?? matrix.length;

    for (let i = headerRow + 1; i < sectionEnd; i++) {
      const cells = matrix[i] ?? [];
      const occurredOn = parseDate(cells[cols.date]);
      if (!occurredOn) {
        if ((cells[cols.date] ?? "") !== "") skipped++;
        continue;
      }
      const charge = cols.charge !== -1 ? parseAmount(cells[cols.charge]) : null;
      const txn = cols.txnAmount !== -1 ? parseAmount(cells[cols.txnAmount]) : null;
      const amount = charge ?? txn;
      if (amount === null || amount === 0) {
        skipped++;
        continue;
      }
      const currencyRaw = cols.currency !== -1 ? clean(cells[cols.currency]) : "";
      const foreign = currencyRaw !== "" && !isIls(currencyRaw);

      rows.push({
        occurredOn,
        merchant: clean(cells[cols.merchant]) || "ללא שם",
        amount,
        rawCategory:
          cols.industry !== -1 ? clean(cells[cols.industry]) || null : null,
        type: cols.type !== -1 ? clean(cells[cols.type]) || null : null,
        note: cols.note !== -1 ? clean(cells[cols.note]) || null : null,
        currency: foreign ? currencyRaw : null,
        originalAmount: foreign ? txn : null,
        reference:
          cols.reference !== -1 ? clean(cells[cols.reference]) || null : null,
      });
    }
  }

  return { rows, sections: headers.length, skipped };
}

/** Stable id for de-duplicating a row across re-imports within a household. */
export function externalId(row: ParsedRow): string {
  const base = `${row.occurredOn}|${row.amount.toFixed(2)}|${row.merchant}`;
  return row.reference ? `${base}|${row.reference}` : base;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/** e.g. ("EUR", 59) → "€59.00". */
export function foreignLabel(currency: string, amount: number): string {
  const sym = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  return `${sym}${amount.toFixed(2)}`;
}
