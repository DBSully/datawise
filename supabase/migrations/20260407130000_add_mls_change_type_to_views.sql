-- Add mls_major_change_type to analysis_queue_v
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
  ml.mls_major_change_type,
  ml.listing_contract_date
from public.screening_results sr
left join lateral (
  select mls.mls_status, mls.mls_major_change_type, mls.listing_contract_date
  from public.mls_listings mls
  where mls.real_property_id = sr.real_property_id
  order by mls.listing_contract_date desc nulls first, mls.created_at desc
  limit 1
) ml on true
order by sr.real_property_id, sr.created_at desc;
