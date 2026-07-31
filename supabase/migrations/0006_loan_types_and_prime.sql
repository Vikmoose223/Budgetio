-- ============================================================================
-- Loan shapes beyond a plain annuity:
--   * a debt with no repayment schedule at all (e.g. money owed to family)
--   * גרייס — a period with no principal repayment
--   * בלון — principal (and optionally interest) due in one lump at the end
--   * שפיצר — the level-payment annuity that was already supported
-- Plus prime-linked rates (פריים פלוס/מינוס).
-- Run once in the Supabase SQL Editor BEFORE deploying the code that uses it.
-- Safe to re-run.
-- ============================================================================

alter table public.liabilities
  add column if not exists loan_type text not null default 'spitzer';

-- Split out so the constraint can be re-created safely on re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'liabilities_loan_type_chk'
  ) then
    alter table public.liabilities
      add constraint liabilities_loan_type_chk
      check (loan_type in ('spitzer', 'grace', 'balloon', 'none'));
  end if;
end $$;

-- Months of grace before regular amortization begins. Ignored for 'balloon'
-- (where the whole term is grace) and 'none'.
alter table public.liabilities
  add column if not exists grace_months int not null default 0;

-- true  = גרייס/בלון מלא — interest accrues into the principal, nothing is paid
-- false = גרייס/בלון חלקי — interest is paid monthly, principal is untouched
alter table public.liabilities
  add column if not exists capitalize_interest boolean not null default false;

-- 'fixed' uses annual_rate as-is; 'prime' uses the household prime rate plus
-- prime_margin, which may be negative (פריים מינוס).
alter table public.liabilities
  add column if not exists rate_type text not null default 'fixed';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'liabilities_rate_type_chk'
  ) then
    alter table public.liabilities
      add constraint liabilities_rate_type_chk
      check (rate_type in ('fixed', 'prime'));
  end if;
end $$;

alter table public.liabilities
  add column if not exists prime_margin numeric(6, 3) not null default 0;

-- ---------------------------------------------------------------------------
-- The prime rate itself.
--
-- Stored per household and edited by hand rather than fetched: Bank of Israel
-- changes it about eight times a year on announced dates, so a stale scrape
-- would silently misprice every prime-linked loan. A number you set yourself
-- and can see on screen is safer than one that looks automatic but isn't.
--
-- Default is the rate as of 2026-07-31: BOI 3.5% + 1.5%.
-- ---------------------------------------------------------------------------
alter table public.households
  add column if not exists prime_rate numeric(6, 3) not null default 5.0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'households_prime_rate_chk'
  ) then
    alter table public.households
      add constraint households_prime_rate_chk
      check (prime_rate >= 0 and prime_rate <= 50);
  end if;
end $$;
