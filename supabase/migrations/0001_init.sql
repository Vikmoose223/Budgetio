-- ============================================================================
-- Budget app — initial schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: tables use "if not exists", policies/triggers are dropped first.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A household links the two partners together. All data is scoped to it.
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Short human-shareable code the second partner uses to join.
  invite_code text not null unique default encode(gen_random_bytes(4), 'hex'),
  created_at  timestamptz not null default now()
);

-- One profile per auth user; household_id is null until they create/join one.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Spending / saving categories, e.g. "מזון", "דיור".
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  icon         text,                        -- lucide icon name
  color        text,                        -- design token, e.g. 'chart-1'
  kind         text not null default 'expense' check (kind in ('expense', 'saving')),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists categories_household_idx on public.categories (household_id);

-- Monthly target per category. `month` is the first day of the month.
create table if not exists public.budget_goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete cascade,
  month         date not null,
  target_amount numeric(12, 2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (category_id, month)
);

-- Every expense, entered manually or imported from the bank.
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete set null,
  occurred_on  date not null,
  amount       numeric(12, 2) not null,     -- positive = expense
  description  text,
  merchant     text,
  source       text not null default 'manual' check (source in ('manual', 'import')),
  external_id  text,                         -- stable hash of an imported row, for dedup
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists transactions_household_date_idx
  on public.transactions (household_id, occurred_on);
-- Prevent importing the same bank row twice within a household.
create unique index if not exists transactions_household_external_id_key
  on public.transactions (household_id, external_id) where external_id is not null;

-- Learned memory: keyword seen in a description/merchant → category.
create table if not exists public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  keyword      text not null,
  category_id  uuid not null references public.categories (id) on delete cascade,
  hit_count    int  not null default 1,
  created_at   timestamptz not null default now(),
  unique (household_id, keyword)
);

-- A batch of imported rows awaiting user approval.
create table if not exists public.import_batches (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  filename     text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'discarded')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper: the current user's household id.
-- SECURITY DEFINER so it bypasses RLS on profiles (avoids policy recursion).
-- ---------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs to create or join a household (SECURITY DEFINER = controlled writes).
-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  h_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'משק בית'))
    returning id into h_id;
  update public.profiles set household_id = h_id where id = auth.uid();
  return h_id;
end;
$$;

create or replace function public.join_household(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  h_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into h_id from public.households
    where invite_code = lower(trim(p_invite_code));
  if h_id is null then
    raise exception 'invalid invite code';
  end if;
  update public.profiles set household_id = h_id where id = auth.uid();
  return h_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.households     enable row level security;
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.budget_goals   enable row level security;
alter table public.transactions   enable row level security;
alter table public.category_rules enable row level security;
alter table public.import_batches enable row level security;

-- households: members can read and rename their own household.
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated using (id = public.current_household_id());
drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated using (id = public.current_household_id());

-- profiles: a user manages their own row and can see household members.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or household_id = public.current_household_id());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid());

-- Household-scoped tables: full access limited to the caller's household.
-- (Same policy shape repeated per table.)
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists budget_goals_all on public.budget_goals;
create policy budget_goals_all on public.budget_goals
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists transactions_all on public.transactions;
create policy transactions_all on public.transactions
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists category_rules_all on public.category_rules;
create policy category_rules_all on public.category_rules
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists import_batches_all on public.import_batches;
create policy import_batches_all on public.import_batches
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
