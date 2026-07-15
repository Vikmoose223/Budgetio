/**
 * Fuzzy duplicate detection for expenses.
 *
 * The import flow already skips *exact* re-imports via the `external_id`
 * (`date|amount|merchant|reference`) unique key. This catches the cases that
 * key misses — the same real transaction whose bank reference differs (or is
 * absent), or a manual entry (which has no `external_id` at all) — by matching
 * on name + date + amount directly.
 *
 * Match rule: exact date, exact amount (to the agora), and exact name after
 * light normalization (trim, collapse whitespace, case-fold). Deliberately
 * strict to avoid flagging two genuinely different charges.
 */

export type DupCandidate = {
  occurredOn: string; // ISO yyyy-mm-dd
  amount: number; // ILS
  name: string; // merchant (or description) of the incoming expense
};

export type DupExisting = {
  id: string;
  occurred_on: string;
  amount: number;
  merchant: string | null;
  description: string | null;
};

/** Trim, collapse internal whitespace, and case-fold for exact-name compare. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("he");
}

/** Equal to the agora (avoids float noise on numeric amounts). */
export function sameAmount(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

/** An existing row's comparable name: merchant first, else description. */
function existingName(e: DupExisting): string {
  return normalizeName(e.merchant || e.description);
}

/** True when `candidate` and `existing` are the same expense by name+date+amount. */
export function isDuplicate(
  candidate: DupCandidate,
  existing: DupExisting,
): boolean {
  const name = normalizeName(candidate.name);
  if (name === "") return false; // no name to compare — don't flag
  return (
    candidate.occurredOn === existing.occurred_on &&
    sameAmount(candidate.amount, existing.amount) &&
    name === existingName(existing)
  );
}

/** Every existing row that matches the candidate (usually 0 or 1). */
export function findDuplicates(
  candidate: DupCandidate,
  existing: DupExisting[],
): DupExisting[] {
  return existing.filter((e) => isDuplicate(candidate, e));
}
