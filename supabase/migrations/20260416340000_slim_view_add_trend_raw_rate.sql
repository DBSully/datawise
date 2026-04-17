-- Expose trend_raw_rate on screening_results_latest_v so the queue
-- table can show the actual market-derived rate (not the capped rate).

drop view if exists public.screening_results_latest_v;

create view public.screening_results_latest_v
with (security_invoker = true) as
select
  id,
  screening_batch_id,
  real_property_id,
  subject_address,
  subject_city,
  subject_property_type,
  subject_list_price,
  subject_building_sqft,
  subject_above_grade_sqft,
  subject_below_grade_total_sqft,
  subject_year_built,
  arv_aggregate,
  arv_per_sqft,
  arv_comp_count,
  rehab_total,
  hold_total,
  transaction_total,
  financing_total,
  max_offer,
  spread,
  est_gap_per_sqft,
  offer_pct,
  is_prime_candidate,
  screening_status,
  promoted_analysis_id,
  comp_search_run_id,
  trend_annual_rate,
  trend_raw_rate,
  trend_confidence,
  trend_detail_json,
  review_action,
  reviewed_at,
  pass_reason,
  screening_updated_at,
  created_at,
  latest_mls_status,
  latest_mls_major_change_type,
  latest_listing_contract_date
from public.screening_results
where is_latest_for_property = true;
