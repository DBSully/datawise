-- Add analysis completion timestamp and last-screened timestamp
-- for daily activity tracking

-- analyses: track when analyst marks work complete
alter table public.analyses
  add column if not exists analysis_completed_at timestamptz;

create index if not exists ix_analyses_completed_at
  on public.analyses (analysis_completed_at desc)
  where analysis_completed_at is not null;

-- screening_results: track when property was screened
alter table public.screening_results
  add column if not exists last_screened_at timestamptz not null default now();

-- Backfill existing screening_results from created_at
update public.screening_results
  set last_screened_at = created_at
  where last_screened_at = now();

create index if not exists ix_screening_results_last_screened_at
  on public.screening_results (last_screened_at desc);

-- Daily activity view: union of screening + analysis completions
create or replace view public.daily_activity_v as
select
  'screening' as activity_type,
  sr.real_property_id,
  null::uuid as analysis_id,
  rp.unparsed_address as address,
  rp.city,
  sr.is_prime_candidate,
  null::text as strategy_type,
  null::text as analysis_status,
  sr.last_screened_at as activity_at
from public.screening_results sr
join public.real_properties rp on rp.id = sr.real_property_id
where sr.last_screened_at is not null

union all

select
  'analysis_complete' as activity_type,
  a.real_property_id,
  a.id as analysis_id,
  rp.unparsed_address as address,
  rp.city,
  null::boolean as is_prime_candidate,
  a.strategy_type,
  a.status as analysis_status,
  a.analysis_completed_at as activity_at
from public.analyses a
join public.real_properties rp on rp.id = a.real_property_id
where a.analysis_completed_at is not null

order by activity_at desc;
