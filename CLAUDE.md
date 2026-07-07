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
- `src/lib/` — `aggregate.ts` (`summarizeMonth`, `monthlyExpenseTrend`), `insights.ts` (rule-based), `recurring.ts`, `format.ts` (ILS + billing-cycle helpers), `categories.ts`.
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
- Next 16: async request APIs (`await cookies()`, `params`, `searchParams`); `next lint` removed. **Never pass a function prop from a Server Component to a Client Component** (crashes) — pass serializable data (e.g. `MonthNav` takes `basePath` + `params`).
- Client-side Supabase mutations with optimistic UI + `router.refresh()`, matching the existing pattern.

## Status
Roadmap stages 0–6 done + settings, recurring, PWA, deploy. Deployed at Vercel (repo `github.com/Vikmoose223/Budgetio`). Full plan: `~/.claude/plans/mighty-leaping-moth.md` (local).

## Possible next work (discussed, not built)
Face-ID app-lock (WebAuthn / Capacitor biometric), Web Push budget-exceeded alerts (iOS 16.4+ installed PWA, needs a backend job), auto bank-sync via `israeli-bank-scrapers` (run **locally** — storing bank credentials is the main risk; never in the cloud/chat), income tracking, CSV export, yearly overview.
