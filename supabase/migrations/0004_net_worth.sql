-- ============================================================================
-- Net worth (הון עצמי): assets, liabilities, valuations, cash flows, holdings,
-- and the caches for auto-fetched market data.
-- Run once in the Supabase SQL Editor BEFORE deploying the code that uses it.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------

-- One row per account/holding container: a pension fund, a brokerage account,
-- a crypto wallet, an apartment, a savings account.
create table if not exists public.asset_accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  kind          text not null default 'other'
                  check (kind in ('pension', 'gemel', 'hishtalmut', 'brokerage',
                                  'crypto', 'real_estate', 'cash', 'other')),
  -- Attribution. NULL = joint/household-owned; otherwise the partner it belongs to.
  owner_profile_id uuid references public.profiles (id) on delete set null,
  currency      text not null default 'ILS' check (currency in ('ILS', 'USD', 'EUR')),
  -- Links a pension/gemel/hishtalmut account to its published fund so we can
  -- drift its value using official monthly yields. Source picks the dataset.
  fund_id       int,
  fund_source   text check (fund_source in ('gemel', 'pension')),
  notes         text,
  sort_order    int  not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists asset_accounts_household_idx
  on public.asset_accounts (household_id);

-- Ticker-level positions inside a brokerage/crypto account. Optional: an
-- account with no holdings is valued purely from its manual valuations.
create table if not exists public.holdings (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.asset_accounts (id) on delete cascade,
  symbol      text not null,                 -- 'VOO', 'TEVA.TA', 'bitcoin'
  quantity    numeric(20, 8) not null default 0,
  market      text not null check (market in ('us', 'tase', 'crypto')),
  created_at  timestamptz not null default now(),
  unique (account_id, symbol)
);
create index if not exists holdings_account_idx on public.holdings (account_id);

-- A known-true value at a point in time — the "anchor" everything drifts from.
-- Stored in the account's own currency.
create table if not exists public.valuations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.asset_accounts (id) on delete cascade,
  as_of       date not null,
  value       numeric(14, 2) not null,
  source      text not null default 'manual' check (source in ('manual', 'auto')),
  created_at  timestamptz not null default now(),
  unique (account_id, as_of)
);
create index if not exists valuations_account_date_idx
  on public.valuations (account_id, as_of desc);

-- Deposits and withdrawals. Without these, a pension contribution looks like a
-- gain; with them we can compute a real money-weighted return (XIRR).
create table if not exists public.account_flows (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.asset_accounts (id) on delete cascade,
  occurred_on date not null,
  amount      numeric(14, 2) not null,       -- positive = deposit, negative = withdrawal
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists account_flows_account_date_idx
  on public.account_flows (account_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Liabilities
-- ---------------------------------------------------------------------------

create table if not exists public.liabilities (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  kind          text not null default 'other'
                  check (kind in ('mortgage', 'personal_loan', 'car_loan',
                                  'credit_line', 'other')),
  owner_profile_id uuid references public.profiles (id) on delete set null,
  currency      text not null default 'ILS' check (currency in ('ILS', 'USD', 'EUR')),
  principal     numeric(14, 2) not null default 0,   -- original amount borrowed
  annual_rate   numeric(6, 3)  not null default 0,   -- percent, e.g. 4.250
  term_months   int            not null default 0,
  start_date    date not null default current_date,
  payment_amount numeric(14, 2),                     -- optional override of the computed payment
  -- Israeli mortgages are often צמוד מדד; 'cpi' compounds the principal by CPI.
  linkage       text not null default 'none' check (linkage in ('none', 'cpi')),
  -- If the real balance is known, it wins over the computed amortization.
  balance_override numeric(14, 2),
  balance_override_as_of date,
  -- e.g. a mortgage against a specific property.
  linked_asset_id uuid references public.asset_accounts (id) on delete set null,
  notes         text,
  sort_order    int  not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists liabilities_household_idx
  on public.liabilities (household_id);

-- ---------------------------------------------------------------------------
-- Caches for auto-fetched public data.
-- Not household-scoped (the data is public and identical for everyone), but
-- readable only by authenticated users and writable only by the service role.
-- ---------------------------------------------------------------------------

create table if not exists public.price_cache (
  symbol     text not null,
  market     text not null check (market in ('us', 'tase', 'crypto')),
  as_of      date not null,
  price      numeric(20, 8) not null,
  currency   text not null,                  -- as reported: USD / ILS / ILA
  fetched_at timestamptz not null default now(),
  primary key (symbol, market, as_of)
);

create table if not exists public.fund_yields_cache (
  fund_id       int  not null,
  source        text not null check (source in ('gemel', 'pension')),
  report_period int  not null,               -- YYYYMM
  fund_name     text,
  managing_corp text,
  monthly_yield numeric(10, 4),
  ytd_yield     numeric(10, 4),
  avg_mgmt_fee  numeric(10, 4),
  sharpe_ratio  numeric(10, 4),
  fetched_at    timestamptz not null default now(),
  primary key (fund_id, source, report_period)
);

create table if not exists public.fx_rates (
  base       text not null,
  quote      text not null,
  as_of      date not null,
  rate       numeric(20, 8) not null,
  fetched_at timestamptz not null default now(),
  primary key (base, quote, as_of)
);

-- Consumer price index, for צמוד-מדד liabilities.
create table if not exists public.cpi_index (
  period     int not null,                   -- YYYYMM
  value      numeric(12, 4) not null,
  fetched_at timestamptz not null default now(),
  primary key (period)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.asset_accounts    enable row level security;
alter table public.holdings          enable row level security;
alter table public.valuations        enable row level security;
alter table public.account_flows     enable row level security;
alter table public.liabilities       enable row level security;
alter table public.price_cache       enable row level security;
alter table public.fund_yields_cache enable row level security;
alter table public.fx_rates          enable row level security;
alter table public.cpi_index         enable row level security;

-- Household-scoped tables: same policy shape as the rest of the app.
drop policy if exists asset_accounts_all on public.asset_accounts;
create policy asset_accounts_all on public.asset_accounts
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists liabilities_all on public.liabilities;
create policy liabilities_all on public.liabilities
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- Child tables inherit scope through their parent account.
drop policy if exists holdings_all on public.holdings;
create policy holdings_all on public.holdings
  for all to authenticated
  using (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ));

drop policy if exists valuations_all on public.valuations;
create policy valuations_all on public.valuations
  for all to authenticated
  using (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ));

drop policy if exists account_flows_all on public.account_flows;
create policy account_flows_all on public.account_flows
  for all to authenticated
  using (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ))
  with check (exists (
    select 1 from public.asset_accounts a
    where a.id = account_id and a.household_id = public.current_household_id()
  ));

-- Public market data caches. The contents are public information (published
-- fund returns, market quotes, FX, CPI) and identical for every household, so
-- they aren't household-scoped.
--
-- Any signed-in user may both read and refresh them. That deliberately avoids
-- needing a service-role key anywhere in the deployment: the refresh route
-- runs under the caller's own session. The worst a household member can do is
-- write a wrong price into a shared cache, which the next refresh corrects.
drop policy if exists price_cache_read on public.price_cache;
drop policy if exists price_cache_all on public.price_cache;
create policy price_cache_all on public.price_cache
  for all to authenticated using (true) with check (true);

drop policy if exists fund_yields_cache_read on public.fund_yields_cache;
drop policy if exists fund_yields_cache_all on public.fund_yields_cache;
create policy fund_yields_cache_all on public.fund_yields_cache
  for all to authenticated using (true) with check (true);

drop policy if exists fx_rates_read on public.fx_rates;
drop policy if exists fx_rates_all on public.fx_rates;
create policy fx_rates_all on public.fx_rates
  for all to authenticated using (true) with check (true);

drop policy if exists cpi_index_read on public.cpi_index;
drop policy if exists cpi_index_all on public.cpi_index;
create policy cpi_index_all on public.cpi_index
  for all to authenticated using (true) with check (true);
