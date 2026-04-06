-- Add lifecycle tracking columns to analysis_pipeline
alter table public.analysis_pipeline
  add column if not exists lifecycle_stage text not null default 'screening',
  add column if not exists disposition text not null default 'active',
  add column if not exists closed_date date,
  add column if not exists project_completed_at timestamptz;

create index if not exists ix_analysis_pipeline_lifecycle_stage
  on public.analysis_pipeline (lifecycle_stage);

create index if not exists ix_analysis_pipeline_disposition
  on public.analysis_pipeline (disposition);

-- Pipeline summary view for dashboard funnel
create or replace view public.dashboard_pipeline_summary_v
with (security_invoker = true) as
select
  ap.lifecycle_stage,
  ap.disposition,
  count(*) as property_count
from public.analysis_pipeline ap
join public.analyses a on a.id = ap.analysis_id
where ap.disposition = 'active'
group by ap.lifecycle_stage, ap.disposition;

-- Import outcomes view: what happened after each import
create or replace view public.import_outcomes_v
with (security_invoker = true) as
select
  ib.id as import_batch_id,
  ib.created_at as imported_at,
  ib.total_row_count,
  ib.unique_listing_count,
  ib.unique_property_count,
  ib.import_notes,
  ib.status as import_status,
  sb.id as screening_batch_id,
  sb.status as screening_status,
  sb.total_subjects as screened_count,
  sb.prime_candidate_count,
  sb.completed_at as screening_completed_at,
  (
    select count(*)
    from public.screening_results sr
    where sr.screening_batch_id = sb.id
      and sr.promoted_analysis_id is not null
  ) as promoted_count
from public.import_batches ib
left join public.screening_batches sb
  on sb.source_import_batch_id = ib.id
order by ib.created_at desc;

-- Daily scorecard function
create or replace function public.get_daily_scorecard(lookback_days int default 7)
returns table (
  day date,
  imports_count bigint,
  listings_imported bigint,
  batches_screened bigint,
  properties_screened bigint,
  prime_candidates bigint,
  promoted_to_analysis bigint
)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(
      current_date - (lookback_days - 1),
      current_date,
      '1 day'::interval
    )::date as day
  )
  select
    d.day,
    (select count(*) from import_batches ib
     where ib.created_at::date = d.day
       and ib.status = 'complete') as imports_count,
    (select coalesce(sum(ib.unique_listing_count), 0) from import_batches ib
     where ib.created_at::date = d.day
       and ib.status = 'complete') as listings_imported,
    (select count(*) from screening_batches sb
     where sb.completed_at::date = d.day
       and sb.status = 'complete') as batches_screened,
    (select coalesce(sum(sb.screened_count), 0) from screening_batches sb
     where sb.completed_at::date = d.day
       and sb.status = 'complete') as properties_screened,
    (select coalesce(sum(sb.prime_candidate_count), 0) from screening_batches sb
     where sb.completed_at::date = d.day
       and sb.status = 'complete') as prime_candidates,
    (select count(*) from screening_results sr
     where sr.created_at::date = d.day
       and sr.promoted_analysis_id is not null) as promoted_to_analysis
  from days d
  order by d.day;
$$;
