-- ============================================================================
-- Configurable "budget month" start day (e.g. a credit-card billing cycle that
-- runs from the 10th). 1 = calendar month. Run once in the Supabase SQL Editor.
-- Safe to re-run.
-- ============================================================================

alter table public.households
  add column if not exists month_start_day int not null default 1;

-- Keep it in a sane range (1..28 so it exists in every month).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'households_month_start_day_chk'
  ) then
    alter table public.households
      add constraint households_month_start_day_chk
      check (month_start_day between 1 and 28);
  end if;
end $$;
