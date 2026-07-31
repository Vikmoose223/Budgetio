-- ============================================================================
-- A ledger per account, which is what "how much did I buy at", "how much have
-- I deposited" and "what did this look like last month" all actually need.
--
--   trades            — buys/sells, so cost basis and real return can be derived
--   recurring_flows   — a standing deposit rule (salary → pension) that expands
--                       into flows instead of being typed out month by month
--   account_snapshots — what each account was worth on a given day
--
-- Run once in the Supabase SQL Editor BEFORE deploying the code that uses it.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Trades
--
-- Quantity becomes derived rather than stored: `holdings.quantity` is the
-- position you told us about, `trades` is how you got there. An "opening
-- position" is just a buy flagged `is_opening`, so you can start from
-- "I hold 100 at an average of 500" without entering years of history.
-- ---------------------------------------------------------------------------
create table if not exists public.trades (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.asset_accounts (id) on delete cascade,
  symbol         text not null,
  market         text not null check (market in ('us', 'tase', 'crypto')),
  side           text not null default 'buy' check (side in ('buy', 'sell')),
  quantity       numeric(20, 8) not null,
  -- Per unit, in `currency` — the price actually paid, not today's price.
  price_per_unit numeric(20, 8) not null,
  currency       text not null default 'ILS',
  fee            numeric(14, 2) not null default 0,
  occurred_on    date not null,
  -- True for the synthetic "this is what I already held" row.
  is_opening     boolean not null default false,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists trades_account_idx
  on public.trades (account_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Recurring deposits
--
-- Pension and קרן השתלמות contributions are monthly and near-identical, so a
-- rule beats thirty rows. Expanded in code rather than materialised, so
-- editing the rule corrects every month at once.
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_flows (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.asset_accounts (id) on delete cascade,
  amount       numeric(14, 2) not null,        -- positive = deposit
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  start_month  date not null,                  -- first day of the first month
  end_month    date,                           -- null = still running
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists recurring_flows_account_idx
  on public.recurring_flows (account_id);

-- ---------------------------------------------------------------------------
-- Daily snapshots
--
-- Deliberately NOT stored in `valuations`. That table is the anchor a pension
-- balance drifts forward from; writing computed estimates into it would make
-- tomorrow's drift compound on top of today's estimate instead of on the
-- balance you actually entered. Keeping them apart keeps "what you told us"
-- and "what we calculated" from contaminating each other.
-- ---------------------------------------------------------------------------
create table if not exists public.account_snapshots (
  account_id uuid not null references public.asset_accounts (id) on delete cascade,
  as_of      date not null,
  value      numeric(14, 2) not null,          -- always ILS
  -- How the value was derived, mirroring ValueBasis, so history can say
  -- whether a past point was exact or an estimate.
  basis      text not null default 'anchor',
  created_at timestamptz not null default now(),
  primary key (account_id, as_of)
);

-- Household-level totals, so the comparison view is one cheap read.
create table if not exists public.net_worth_snapshots (
  household_id      uuid not null references public.households (id) on delete cascade,
  as_of             date not null,
  total_assets      numeric(14, 2) not null default 0,
  total_liabilities numeric(14, 2) not null default 0,
  net_worth         numeric(14, 2) not null default 0,
  created_at        timestamptz not null default now(),
  primary key (household_id, as_of)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.trades              enable row level security;
alter table public.recurring_flows     enable row level security;
alter table public.account_snapshots   enable row level security;
alter table public.net_worth_snapshots enable row level security;

-- Child tables inherit household scope through their parent account.
drop policy if exists trades_all on public.trades;
create policy trades_all on public.trades
  for all to authenticated
  using (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ));

drop policy if exists recurring_flows_all on public.recurring_flows;
create policy recurring_flows_all on public.recurring_flows
  for all to authenticated
  using (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ));

drop policy if exists account_snapshots_all on public.account_snapshots;
create policy account_snapshots_all on public.account_snapshots
  for all to authenticated
  using (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ));

drop policy if exists net_worth_snapshots_all on public.net_worth_snapshots;
create policy net_worth_snapshots_all on public.net_worth_snapshots
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
