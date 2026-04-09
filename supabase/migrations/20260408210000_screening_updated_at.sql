-- Rename last_screened_at → screening_updated_at and track all screening decisions
-- This captures the timing of the most recent screening action (screen, promote, pass, reactivate)

-- Rename column
alter table public.screening_results
  rename column last_screened_at to screening_updated_at;

-- Drop old index, create new one
drop index if exists ix_screening_results_last_screened_at;
create index if not exists ix_screening_results_screening_updated_at
  on public.screening_results (screening_updated_at desc);

-- Backfill: where reviewed_at is set but more recent than screening_updated_at, use it
update public.screening_results
  set screening_updated_at = reviewed_at
  where reviewed_at is not null
    and reviewed_at > screening_updated_at;

-- Recreate daily activity view (must drop to rename column)
drop view if exists public.daily_activity_v;
create view public.daily_activity_v as
select
  'screening' as activity_type,
  sr.real_property_id,
  null::uuid as analysis_id,
  rp.unparsed_address as address,
  rp.city,
  sr.is_prime_candidate,
  null::text as strategy_type,
  sr.review_action as screening_decision,
  sr.screening_updated_at as activity_at
from public.screening_results sr
join public.real_properties rp on rp.id = sr.real_property_id
where sr.screening_updated_at is not null

union all

select
  'analysis_complete' as activity_type,
  a.real_property_id,
  a.id as analysis_id,
  rp.unparsed_address as address,
  rp.city,
  null::boolean as is_prime_candidate,
  a.strategy_type,
  null::text as screening_decision,
  a.analysis_completed_at as activity_at
from public.analyses a
join public.real_properties rp on rp.id = a.real_property_id
where a.analysis_completed_at is not null

order by activity_at desc;
