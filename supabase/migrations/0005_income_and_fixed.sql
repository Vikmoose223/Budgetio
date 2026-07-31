-- ============================================================================
-- 1. Income tracking (its own table, deliberately not mixed into transactions)
-- 2. Manual "this is a fixed expense" flag on transactions
-- Run once in the Supabase SQL Editor BEFORE deploying the code that uses it.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Income
--
-- Kept separate from `transactions` on purpose: every existing calculation
-- (summarizeMonth, the donut, the trend, insights, import dedup) assumes a row
-- in `transactions` is money going out. Folding income in as a negative amount
-- would mean auditing all of them, and those totals have already been through
-- two rounds of bug fixes.
-- ---------------------------------------------------------------------------
create table if not exists public.incomes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  occurred_on  date not null,
  amount       numeric(12, 2) not null,      -- positive = money in
  source       text not null default 'salary'
                 check (source in ('salary', 'freelance', 'bonus', 'rent',
                                   'investment', 'gift', 'refund', 'other')),
  description  text,
  -- Whose income it is; null = joint/household.
  owner_profile_id uuid references public.profiles (id) on delete set null,
  -- Marks a regular monthly income (salary) vs a one-off.
  recurring    boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists incomes_household_date_idx
  on public.incomes (household_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Manual fixed-expense flag
--
-- Complements `detectRecurring`, which *infers* subscriptions from merchant
-- history. This is the explicit override for the cases inference misses.
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists is_fixed boolean not null default false;

create index if not exists transactions_household_fixed_idx
  on public.transactions (household_id) where is_fixed;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.incomes enable row level security;

drop policy if exists incomes_all on public.incomes;
create policy incomes_all on public.incomes
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
