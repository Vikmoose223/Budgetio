import { describe, expect, test } from "vitest";
import {
  parseRows,
  parseAmount,
  parseDate,
  externalId,
  foreignLabel,
} from "./parse";

describe("parseAmount", () => {
  test("strips ₪, spaces and thousands separators", () => {
    expect(parseAmount("₪ 1,256.00")).toBe(1256);
    expect(parseAmount("₪ 17.68")).toBe(17.68);
  });
  test("empty / invalid → null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("—")).toBeNull();
  });
});

describe("parseDate", () => {
  test("day-first strings, short and long years", () => {
    expect(parseDate("7/7/26")).toBe("2026-07-07");
    expect(parseDate("30/06/2026")).toBe("2026-06-30");
  });
  test("Excel serial numbers", () => {
    expect(parseDate("46205")).toBe("2026-07-02");
  });
  test("rejects impossible / non-dates", () => {
    expect(parseDate("31/02/26")).toBeNull();
    expect(parseDate("hello")).toBeNull();
    expect(parseDate("2")).toBeNull();
  });
});

// Format A — Discount Visa: DD/MM/YY dates, "ענף" column, one section.
const discount: unknown[][] = [
  ["פירוט עסקאות"],
  ["תאריך\r\nעסקה", "שם בית עסק", "סכום\r\nעסקה", "סכום\r\nחיוב", "סוג\r\nעסקה", "ענף", "הערות"],
  ["4/7/26", "דלק מנטה", "₪ 187.95", "₪ 187.95", "רגילה", "אנרגיה", ""],
  ["סה\"כ", "", "", "₪ 187.95"],
];

// Format B — multi-section card export: serial dates, a "חיוב לתאריך" trap
// column before the real date, and a foreign section with a currency column.
const multi: unknown[][] = [
  ["חיובים קרובים"],
  ["פירוט עבור הכרטיסים בארץ"],
  ["שם כרטיס", "חיוב לתאריך", "תאריך", "שם בית עסק", "סכום חיוב בש''ח", "סכום קנייה", "אסמכתא", "תאור סוג עסקת אשראי"],
  ["9925", "46213", "46205", "קפה תדהר", "40.00", "40.00", "1016", "עסקה רגילה"],
  ["9925", "46213", "46205", "נאייקס מכונות", "2.00", "2.00", "2005566", "עסקה רגילה"],
  [],
  ["פירוט עבור הכרטיסים בחו''ל"],
  ["שם כרטיס", "חיוב לתאריך", "תאריך", "שם בית עסק", "סכום חיוב בש''ח", "סכום קנייה", "מטבע מקורי", "אסמכתא", "תאור סוג עסקת אשראי"],
  ["9925", "46205", "46152", "MAISON RAMBUTEAU", "201.93", "59.00", "EUR", "198644", "עסקה רגילה"],
];

describe("parseRows — Discount format", () => {
  const parsed = parseRows(discount);
  test("reads the data row, skips the footer, uses charge amount", () => {
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      occurredOn: "2026-07-04",
      merchant: "דלק מנטה",
      amount: 187.95,
      rawCategory: "אנרגיה",
    });
  });
});

describe("parseRows — multi-section format", () => {
  const parsed = parseRows(multi);

  test("finds both sections and all data rows", () => {
    expect(parsed.sections).toBe(2);
    expect(parsed.rows).toHaveLength(3);
  });

  test("uses the transaction date column, not 'חיוב לתאריך'", () => {
    // Serial 46205 = 2026-07-02, NOT the billing date 46213.
    expect(parsed.rows[0].occurredOn).toBe("2026-07-02");
    expect(parsed.rows[0]).toMatchObject({ merchant: "קפה תדהר", amount: 40 });
  });

  test("captures foreign currency + original amount, ILS as the amount", () => {
    const fx = parsed.rows.find((r) => r.merchant === "MAISON RAMBUTEAU")!;
    expect(fx.amount).toBe(201.93); // ILS charge
    expect(fx.currency).toBe("EUR");
    expect(fx.originalAmount).toBe(59);
  });
});

describe("externalId", () => {
  test("includes the reference so same-day same-amount rows stay distinct", () => {
    const [a, b] = parseRows(multi).rows;
    expect(externalId(a)).not.toBe(externalId(b));
    expect(externalId(a)).toContain("1016"); // reference
  });
});

describe("foreignLabel", () => {
  test("formats known currency symbols", () => {
    expect(foreignLabel("EUR", 59)).toBe("€59.00");
    expect(foreignLabel("USD", 7)).toBe("$7.00");
  });
});
