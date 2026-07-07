// Rules + learned-memory categorization for imported statement rows.

export type LearnedRule = { keyword: string; category_id: string };
export type NamedCategory = { id: string; name: string; kind: "expense" | "saving" };

// Bank "ענף" (industry) → our default category name.
export const INDUSTRY_TO_CATEGORY: Record<string, string> = {
  "מזון ומשקאות": "מזון",
  מסעדות: "בילויים",
  "מזון מהיר": "בילויים",
  "פנאי ובידור": "בילויים",
  "בילוי ופנאי": "בילויים",
  אנרגיה: "דלק",
  דלק: "דלק",
  "רכב ותחבורה": "תחבורה",
  תחבורה: "תחבורה",
  תיירות: "תחבורה",
  "רפואה ובריאות": "בריאות",
  "תקשורת ומחשבים": "חשבונות",
  "חשמל ומים": "חשבונות",
  ביטוח: "חשבונות",
  "ריהוט ובית": "קניות",
  "בית ומשק": "קניות",
  "ציוד ומשרד": "קניות",
  "ביגוד והנעלה": "קניות",
  חינוך: "חינוך",
};

// Fallback merchant keyword → default category name.
export const MERCHANT_KEYWORDS: { kw: string; category: string }[] = [
  { kw: "דלק", category: "דלק" },
  { kw: "פז", category: "דלק" },
  { kw: "סונול", category: "דלק" },
  { kw: "שופרסל", category: "מזון" },
  { kw: "רמי לוי", category: "מזון" },
  { kw: "ויקטורי", category: "מזון" },
  { kw: "טיב טעם", category: "מזון" },
  { kw: "יוחננוף", category: "מזון" },
  { kw: "סופר", category: "מזון" },
  { kw: "אטליז", category: "מזון" },
  { kw: "netflix", category: "בילויים" },
  { kw: "spotify", category: "בילויים" },
  { kw: "פיצה", category: "בילויים" },
  { kw: "פלאפל", category: "בילויים" },
  { kw: "מסעד", category: "בילויים" },
  { kw: "שווארמ", category: "בילויים" },
  { kw: "בורגר", category: "בילויים" },
  { kw: "פארם", category: "בריאות" },
  { kw: "מכבי", category: "בריאות" },
  { kw: "כללית", category: "בריאות" },
  { kw: "פרטנר", category: "חשבונות" },
  { kw: "סלקום", category: "חשבונות" },
  { kw: "הוט", category: "חשבונות" },
  { kw: "בזק", category: "חשבונות" },
  { kw: "איקאה", category: "קניות" },
  { kw: "ikea", category: "קניות" },
  { kw: "קרביץ", category: "קניות" },
];

export type SuggestionSource = "memory" | "industry" | "keyword" | "none";
export type Suggestion = { categoryId: string | null; source: SuggestionSource };

/**
 * Suggest a category for a row. Priority: learned memory (the household taught
 * this merchant) → bank industry mapping → merchant keyword → none.
 */
export function suggestCategory(
  row: { merchant: string; rawCategory: string | null },
  ctx: { rules: LearnedRule[]; categoriesByName: Map<string, NamedCategory> },
): Suggestion {
  const merchant = row.merchant.toLowerCase();

  for (const r of ctx.rules) {
    const kw = r.keyword.toLowerCase().trim();
    if (kw && merchant.includes(kw)) {
      return { categoryId: r.category_id, source: "memory" };
    }
  }

  if (row.rawCategory) {
    const name = INDUSTRY_TO_CATEGORY[row.rawCategory.trim()];
    const cat = name ? ctx.categoriesByName.get(name) : undefined;
    if (cat) return { categoryId: cat.id, source: "industry" };
  }

  for (const { kw, category } of MERCHANT_KEYWORDS) {
    if (merchant.includes(kw.toLowerCase())) {
      const cat = ctx.categoriesByName.get(category);
      if (cat) return { categoryId: cat.id, source: "keyword" };
    }
  }

  return { categoryId: null, source: "none" };
}
