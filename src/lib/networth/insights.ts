/**
 * Rule-based insights for the net-worth page, mirroring the expense
 * dashboard's `generateInsights`.
 */

import { formatILS } from "../format";
import type { Insight } from "../insights";
import type { NetWorthSummary } from "./summary";
import { monthsOfRunway } from "./summary";
import type { ValuedAccount, ValuedLiability } from "./value";

/** Above this share of total assets, a single holding is worth flagging. */
const CONCENTRATION_THRESHOLD = 0.5;
/** Management fee (percent per year) above which the fee is worth noticing. */
const HIGH_FEE_PCT = 0.8;

const MAX_INSIGHTS = 5;

export type NetWorthInsightInput = {
  summary: NetWorthSummary;
  accounts: ValuedAccount[];
  liabilities: ValuedLiability[];
  /** Net worth one month earlier, for the trend line. */
  prevNetWorth: number | null;
  /** Average monthly spending, from the existing expense history. */
  avgMonthlyExpenses: number | null;
  /** Fee per linked fund account id, from the published data. */
  feeByAccountId?: Map<string, number>;
};

export function generateNetWorthInsights({
  summary,
  accounts,
  liabilities,
  prevNetWorth,
  avgMonthlyExpenses,
  feeByAccountId,
}: NetWorthInsightInput): Insight[] {
  const insights: Insight[] = [];

  // --- Warnings first ------------------------------------------------------

  if (summary.netWorth < 0) {
    insights.push({
      id: "negative-net-worth",
      tone: "warning",
      title: "ההתחייבויות גדולות מהנכסים",
      text: `הפער עומד על ${formatILS(Math.abs(summary.netWorth))}.`,
    });
  }

  const top = summary.byKind[0];
  if (top && top.share > CONCENTRATION_THRESHOLD && summary.byKind.length > 1) {
    insights.push({
      id: "concentration",
      tone: "info",
      title: "ריכוז גבוה בסוג נכס אחד",
      text: `${Math.round(top.share * 100)}% מהנכסים נמצאים ב${top.label}.`,
    });
  }

  if (feeByAccountId && feeByAccountId.size > 0) {
    let worst: { name: string; fee: number } | null = null;
    for (const account of accounts) {
      const fee = feeByAccountId.get(account.id);
      if (fee === undefined || fee < HIGH_FEE_PCT) continue;
      if (!worst || fee > worst.fee) worst = { name: account.name, fee };
    }
    if (worst) {
      insights.push({
        id: "high-fee",
        tone: "warning",
        title: "דמי ניהול גבוהים",
        text: `${worst.name} — ${worst.fee.toFixed(2)}% בשנה. שווה לבדוק מסלול זול יותר.`,
      });
    }
  }

  // --- Returns -------------------------------------------------------------

  const withReturns = accounts.filter(
    (a): a is ValuedAccount & { returnRate: number } => a.returnRate !== null,
  );
  if (withReturns.length > 0) {
    const best = withReturns.reduce((a, b) => (b.returnRate > a.returnRate ? b : a));
    insights.push({
      id: "best-return",
      tone: best.returnRate >= 0 ? "success" : "info",
      title: `התשואה הגבוהה ביותר: ${best.name}`,
      text: `${(best.returnRate * 100).toFixed(1)}% בשנה (משוקללת לפי הפקדות).`,
    });
  }

  // --- Trend ---------------------------------------------------------------

  if (prevNetWorth !== null && prevNetWorth !== 0) {
    const diff = summary.netWorth - prevNetWorth;
    const pct = Math.round((Math.abs(diff) / Math.abs(prevNetWorth)) * 100);
    insights.push({
      id: diff >= 0 ? "net-worth-up" : "net-worth-down",
      tone: diff >= 0 ? "success" : "warning",
      title: diff >= 0 ? "ההון העצמי עלה" : "ההון העצמי ירד",
      text: `${formatILS(Math.abs(diff))} (${pct}%) מהחודש הקודם.`,
    });
  }

  // --- Runway: only possible because the app holds real expense history ----

  const runway =
    avgMonthlyExpenses !== null
      ? monthsOfRunway(summary.liquidAssets, avgMonthlyExpenses)
      : null;
  if (runway !== null) {
    insights.push({
      id: "runway",
      tone: runway >= 6 ? "success" : runway >= 3 ? "info" : "warning",
      title: "כרית ביטחון",
      text: `הנכסים הנזילים מכסים ${runway} חודשי הוצאות.`,
    });
  }

  // --- Debt progress -------------------------------------------------------

  const mortgage = liabilities.find((l) => l.kind === "mortgage");
  if (mortgage && mortgage.monthsRemaining > 0) {
    const years = Math.floor(mortgage.monthsRemaining / 12);
    const months = mortgage.monthsRemaining % 12;
    insights.push({
      id: "mortgage-remaining",
      tone: "info",
      title: "משכנתא",
      text: `נותרו ${formatILS(mortgage.balance)} ועוד ${years} שנים ו-${months} חודשים.`,
    });
  }

  if (summary.unvaluableCount > 0) {
    insights.push({
      id: "unvaluable",
      tone: "info",
      title: "חסרים נתונים",
      text: `${summary.unvaluableCount} חשבונות ללא שווי — הוסיפו יתרה כדי שייכללו בסיכום.`,
    });
  }

  return insights.slice(0, MAX_INSIGHTS);
}
