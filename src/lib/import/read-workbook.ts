import * as XLSX from "xlsx";

/**
 * Read an uploaded xlsx/xls/csv file into a plain string matrix that
 * `parseRows` can consume. Client-only (keeps SheetJS out of other bundles).
 */
export function workbookToMatrix(data: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];
}
