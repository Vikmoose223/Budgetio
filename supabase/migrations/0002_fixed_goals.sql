-- ============================================================================
-- Goals become a single value per category (same for every month), instead of
-- a per-month budget_goals row. Run once in the Supabase SQL Editor.
-- Safe to re-run.
-- ============================================================================

-- 1. New column: the fixed monthly goal for the category.
alter table public.categories
  add column if not exists monthly_goal numeric(12, 2) not null default 0;

-- 2. Backfill from existing per-month goals (use each category's latest month).
update public.categories c
set monthly_goal = bg.target_amount
from (
  select distinct on (category_id) category_id, target_amount
  from public.budget_goals
  order by category_id, month desc
) bg
where bg.category_id = c.id
  and c.monthly_goal = 0;

-- Note: the budget_goals table is now unused by the app but is left in place
-- (non-destructive). It can be dropped later if desired.
