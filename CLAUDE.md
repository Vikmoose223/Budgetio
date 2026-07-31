@AGENTS.md

# Budgetio — couples' budget-tracking web app

Private budget app for two partners (Hebrew, RTL). Track shared expenses, set
per-category monthly goals, import bank statements, see a charts dashboard with
insights. Personal use.

## Stack
- **Next.js 16** (App Router) + TypeScript + **Tailwind v4** + **shadcn/ui** (base-nova variant, built on **Base UI** primitives — note: `<Button>` has no `asChild`; use `render` prop or style a `<Link>` with `buttonVariants`).
- **Supabase** (Postgres + Auth) — shared cloud DB. Auth is **client-side** via `@supabase/ssr` browser client; session refresh + route guard in `src/proxy.ts` (Next 16 renamed `middleware`→`proxy`).
- **Recharts 3** (shadcn chart wrapper), **SheetJS `xlsx`** (import), **next-themes** (dark mode), **sonner** (toasts).
- Tests: **Vitest** (unit) + **Playwright** (E2E). Deploy: **Vercel** (auto-deploys on push to `main`). Installable **PWA** (`src/app/manifest.ts`, `public/sw.js`).

## Commands
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm run test`
- E2E: `npm run test:e2e` (smoke only). Full live flow: `RUN_AUTH_E2E=1 npx playwright test e2e/auth.spec.ts --project=chromium` (creates throwaway Supabase users; needs `.env.local`).
- After moving route files: `npx next typegen` (stale `.next/types` cause phantom tsc errors).

## Env (`.env.local`, not committed)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key — safe/public). Same values are set in Vercel. See `DEPLOY.md`.

## Architecture / key files
- `src/app/(app)/` — authenticated pages sharing a shell (`AppHeader` + mobile bottom `nav.tsx`): `dashboard/`, `transactions/`, `recurring/`, `import/`, `settings/` (+ `settings/categories/`).
- `src/app/onboarding/`, `src/app/login/` — outside the `(app)` shell.
- `src/lib/supabase/` — `client.ts`, `server.ts` (async `cookies()`), `middleware.ts` (session), `types.ts` (hand-maintained `Database` type — keep in sync with migrations).
- `src/lib/import/` — `parse.ts` (format-agnostic: multi-section, serial dates, foreign currency, reference dedup), `categorize.ts` (learned rules → bank "ענף" → keywords), `read-workbook.ts`.
- `src/lib/` — `aggregate.ts` (`summarizeMonth`, `monthlyExpenseTrend`), `insights.ts` (rule-based), `recurring.ts`, `format.ts` (ILS + billing-cycle helpers), `categories.ts`, `dedup.ts` (fuzzy duplicate detection: exact name+date+amount).
- `src/components/month-nav.tsx` — shared month stepper/picker (serializable props only).

## Data model (Supabase; migrations in `supabase/migrations/`, all applied)
- `households` (name, invite_code, **month_start_day** 1-28 = billing-cycle day), `profiles` (→ household), `categories` (name, icon, color, kind expense|saving, sort_order, **monthly_goal**), `transactions` (occurred_on, amount ILS, description, merchant, source, external_id for dedup, category_id nullable), `category_rules` (learned merchant→category memory), `budget_goals` (**deprecated/unused** — goals now live on `categories.monthly_goal`), `import_batches`.
- RLS scopes everything to the caller's household via `current_household_id()`. RPCs: `create_household`, `join_household`.
- Migrations: `0001_init`, `0002_fixed_goals` (goal per category), `0003_month_start_day`. **New migrations must be run by the user in the Supabase SQL Editor before pushing code that depends on them** (avoids breaking the live app).

## Key conventions & gotchas
- Hebrew/RTL throughout; currency ILS (₪) via `formatILS`. Font Heebo.
- **Goals are fixed per category** (same every month), stored on `categories.monthly_goal`.
- **Budget month = a billing period** starting on `month_start_day`. Use `periodRange(monthISO, startDay)` and `budgetMonthOf(dateISO, startDay)`. Dashboard & expenses tab default to `budgetMonthOf(today, startDay)` — NOT the calendar month (a past bug).
- Dashboard "total expenses" includes uncategorized spending (all non-saving txns).
- **Two-tier duplicate detection.** Exact re-imports are skipped via the `external_id` (`date|amount|merchant|reference`) unique key. On top of that, `dedup.ts` flags *fuzzy* duplicates — same name+date+amount (whitespace/case-insensitive) that the key missed (differing/absent bank reference, or a manual entry with no `external_id`). Import shows a per-row **דלג/החלף/שמור שניהם** control (default skip); manual add opens a resolution dialog. "Replace" updates the existing row in place. Adding a dup-check `SELECT` before manual insert makes saving slightly slower — E2E must wait for the dialog to close before navigating (navigating mid-insert cancels it).
- Next 16: async request APIs (`await cookies()`, `params`, `searchParams`); `next lint` removed. **Never pass a function prop from a Server Component to a Client Component** (crashes) — pass serializable data (e.g. `MonthNav` takes `basePath` + `params`).
- Client-side Supabase mutations with optimistic UI + `router.refresh()`, matching the existing pattern.
- **A client view seeded from a server prop (`useState(initial)`) must re-sync when that prop changes on `?searchParams` navigation** — the client instance persists across the transition, so `useState` alone freezes the data. `TransactionsView` resets `txns` during render when a `month|category` key changes (past bug: changing months moved the picker but not the expenses).
- **Every `(app)` route has a `loading.tsx` skeleton** so tab navigation shows instant feedback while the server round-trips to Supabase (each dynamic page = several sequential auth+query RTs; ~2s on local dev, fast in prod). Add one for any new route.

## Net worth tab (הון עצמי) — `/net-worth`
Balance sheet half of the app: assets vs liabilities, per-partner, with auto-fetched market data.

- **Data model**: migration `0004_net_worth.sql` — `asset_accounts`, `holdings`, `valuations`, `account_flows`, `liabilities`, plus public caches `price_cache`, `fund_yields_cache`, `fx_rates`, `cpi_index`. ⚠️ **Not yet applied — run it in the Supabase SQL Editor before pushing.**
- **Logic** in `src/lib/networth/`: `xirr.ts` (money-weighted return), `amortization.ts` (loan schedule, CPI-linked), `drift.ts` (anchor + published yields), `currency.ts`, `value.ts` (per-account valuation), `summary.ts`, `trend.ts`, `insights.ts`.
- **Sources** in `src/lib/networth/sources/` — **all keyless, no secrets**:
  | Need | Source |
  |---|---|
  | תשואות גמל/השתלמות/פנסיה | `data.gov.il` CKAN — `gemelnet` / `pensia-net`, daily, ~1 month lag |
  | מניות/ETF ארה"ב **ו**ת"א | Yahoo `query1.finance.yahoo.com/v8/finance/chart/{sym}` |
  | קריפטו | CoinGecko `simple/price` |
  | FX → ILS | Frankfurter |
  | מדד לצרכן | CBS `api.cbs.gov.il` |
- 🚨 **TASE quotes come back as `ILA` (אגורות), not shekels** — 10870 = ₪108.70. `currency.ts:toILS` divides by 100; it has a dedicated test because the failure mode (100× inflation) still looks plausible on screen.
- **The drift model**: pension balances can't be fetched (behind המסלקה login), so you enter a balance once (עוגן) and published monthly yields compound on top. Holdings-based accounts are priced exactly; loans are computed exactly.
- **Every value shows its provenance** (`ValueBadge`: מדויק / מחושב / מוערך / ידני / חסר שווי). Never render a value without it.
- **Refresh**: `POST /api/net-worth/refresh` runs under the *caller's own session* (cache tables are authenticated-writable), so there's no service-role key. `MarketRefresher` fires it in the background when the cache is >12h old, plus a manual button. It also snapshots priced accounts into `valuations` so the trend chart accumulates real history — the trend never back-projects today's prices onto past months.
- Returns use **XIRR** over real deposits/withdrawals; `null` (→ "תשואה לא זמינה") rather than a wrong number when flows are unknown.

## Income & fixed expenses (migration `0005`)
- **`incomes` is its own table, deliberately not folded into `transactions`.** Every existing calculation (`summarizeMonth`, donut, trend, insights, import dedup) assumes a `transactions` row is money *out*; a negative-amount row would mean re-auditing all of them, and those totals have already been through two rounds of fixes. Logic lives in `src/lib/income.ts` (`summarizeIncome`, `cashFlow`, `incomeVsExpenseTrend`).
- **`transactions.is_fixed`** — the manual "this is קבועה" override. Complements `recurring.ts`'s *inference* from merchant history, which misses varying merchant names and one-off-so-far charges. Grouping logic in `src/lib/fixed.ts`.
- **Expenses tab now slices two ways**: `MonthNav` (month) + `CategorySegments` (category, linking to the existing `?category=` filter). The breakdown needs a **second unfiltered query** for the month — the filtered list can't produce it.
- `/recurring` shows both: manually flagged (grouped by category, month-scoped, with a `MonthNav`) and auto-detected (all history).
- Dashboard shows the income-vs-expenses card **only when income exists**, so an untracked household doesn't get a permanent ₪0 tile.

## Status
Roadmap stages 0–6 done + settings, recurring, PWA, deploy, **net worth tab**, **income + fixed-expense flag**. 187 unit tests, E2E smoke green. Deployed at Vercel (repo `github.com/Vikmoose223/Budgetio`). Full plan: `~/.claude/plans/mighty-leaping-moth.md` (local).

## 🚨 Migrations pending
`0004_net_worth.sql` and `0005_income_and_fixed.sql` have **not been applied yet**. Run both in the Supabase SQL Editor before pushing — `main` auto-deploys.

## Possible later work (discussed, not built)
Face-ID app-lock (WebAuthn / Capacitor biometric), Web Push budget-exceeded alerts (iOS 16.4+ installed PWA — the refresh route is now the precedent for server-side work), auto bank-sync via `israeli-bank-scrapers` (run **locally** — storing bank credentials is the main risk; never in the cloud/chat), CSV export, yearly overview.
