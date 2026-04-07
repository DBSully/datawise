-- Phase 2: Add review tracking to screening_results and promotion context to analysis_pipeline

-- screening_results: track human review decisions
alter table public.screening_results
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid references auth.users(id),
  add column if not exists review_action text,
  add column if not exists pass_reason text;

-- Constrain review_action to known values
alter table public.screening_results
  add constraint chk_screening_results_review_action
  check (review_action is null or review_action in ('promoted', 'passed'));

-- Index for filtering unreviewed results (the default queue view)
create index if not exists ix_screening_results_review_action
  on public.screening_results (review_action)
  where review_action is null;

-- analysis_pipeline: track promotion context
alter table public.analysis_pipeline
  add column if not exists promoted_at timestamptz,
  add column if not exists promoted_from_screening_result_id uuid
    references public.screening_results(id),
  add column if not exists watch_list_note text;

-- Backfill: mark already-promoted screening results as reviewed
update public.screening_results
set
  review_action = 'promoted',
  reviewed_at = created_at
where promoted_analysis_id is not null
  and review_action is null;

-- Backfill: set promoted_at on existing pipeline rows that came from screening
update public.analysis_pipeline ap
set
  promoted_at = sr.created_at,
  promoted_from_screening_result_id = sr.id
from public.screening_results sr
where sr.promoted_analysis_id = ap.analysis_id
  and ap.promoted_at is null;

-- Update the analysis_queue_v view to include review columns
-- so the screening queue can filter by reviewed status
drop view if exists public.analysis_queue_v;

create or replace view public.analysis_queue_v
with (security_invoker = true) as
select distinct on (sr.real_property_id)
  sr.id,
  sr.screening_batch_id,
  sr.real_property_id,
  sr.subject_address,
  sr.subject_city,
  sr.subject_property_type,
  sr.subject_list_price,
  sr.subject_building_sqft,
  sr.subject_above_grade_sqft,
  sr.subject_below_grade_total_sqft,
  sr.subject_year_built,
  sr.arv_aggregate,
  sr.arv_per_sqft,
  sr.arv_comp_count,
  sr.rehab_total,
  sr.hold_total,
  sr.transaction_total,
  sr.financing_total,
  sr.max_offer,
  sr.spread,
  sr.est_gap_per_sqft,
  sr.offer_pct,
  sr.is_prime_candidate,
  sr.screening_status,
  sr.promoted_analysis_id,
  sr.comp_search_run_id,
  sr.trend_annual_rate,
  sr.trend_confidence,
  sr.trend_detail_json,
  sr.review_action,
  sr.reviewed_at,
  sr.pass_reason,
  ml.mls_status,
  ml.listing_contract_date
from public.screening_results sr
left join lateral (
  select mls.mls_status, mls.listing_contract_date
  from public.mls_listings mls
  where mls.real_property_id = sr.real_property_id
  order by mls.listing_contract_date desc nulls first, mls.created_at desc
  limit 1
) ml on true
order by sr.real_property_id, sr.created_at desc;
