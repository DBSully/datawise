-- Drop the profiles LEFT JOIN from analysis_queue_v. It was added in
-- 20260416200000 to surface analyst names for the "Reviewed by [name]"
-- badge, but joining profiles inside a LATERAL that fires per row (8k+
-- screening_results) plus RLS evaluation per lookup pushed the query
-- past the 8s statement timeout — even with the policy using the
-- SECURITY DEFINER helper.
--
-- New approach: expose active_analysis_owner_id only. The app does a
-- single follow-up query to resolve names for the small set of owners
-- actually on the current page (typically < 50).

begin;

drop view if exists public.analysis_queue_v;

create view public.analysis_queue_v
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
  sr.screening_updated_at,
  ml.mls_status,
  ml.mls_major_change_type,
  ml.listing_contract_date,

  case when aa.analysis_id is not null then true else false end as has_active_analysis,
  aa.analysis_id        as active_analysis_id,
  aa.lifecycle_stage    as active_lifecycle_stage,
  aa.interest_level     as active_interest_level,
  aa.owner_id           as active_analysis_owner_id,

  case
    when aa.analysis_created_at is null          then false
    when sr.created_at > aa.analysis_created_at  then true
    else false
  end as has_newer_screening_than_analysis

from public.screening_results sr
left join lateral (
  select
    mls.mls_status,
    mls.mls_major_change_type,
    mls.listing_contract_date
  from public.mls_listings mls
  where mls.real_property_id = sr.real_property_id
  order by mls.listing_contract_date desc nulls first, mls.created_at desc
  limit 1
) ml on true
left join lateral (
  select
    a.id                 as analysis_id,
    a.created_at         as analysis_created_at,
    a.created_by_user_id as owner_id,
    ap.lifecycle_stage,
    ap.interest_level
  from public.analyses a
  join public.analysis_pipeline ap on ap.analysis_id = a.id
  where a.real_property_id = sr.real_property_id
    and ap.disposition in ('active', 'closed')
  order by a.created_at desc
  limit 1
) aa on true
order by sr.real_property_id, sr.created_at desc;

commit;
