-- Slim "latest screening result per property" view for the /screening page.
--
-- analysis_queue_v does DISTINCT ON over 8k+ screening_results rows AND
-- fires two LATERAL joins (mls_listings, analyses+analysis_pipeline) for
-- every row. That's ~16k lateral invocations per page load — past the 8s
-- statement timeout.
--
-- This view does only the DISTINCT ON. The /screening page queries this,
-- then makes small batched follow-up queries (mls_listings, analyses,
-- profiles) scoped to the 50 visible rows — each of which is trivially fast.
--
-- analysis_queue_v is kept as-is for other consumers (e.g. Dashboard's
-- unreviewed prime candidates, which filters to is_prime_candidate=true
-- and only touches a handful of rows).

begin;

create or replace view public.screening_results_latest_v
with (security_invoker = true) as
select distinct on (real_property_id)
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
  trend_confidence,
  trend_detail_json,
  review_action,
  reviewed_at,
  pass_reason,
  screening_updated_at,
  created_at
from public.screening_results
order by real_property_id, created_at desc;

comment on view public.screening_results_latest_v is
  'Slim "latest screening result per property" view with no lateral joins. '
  'Used by /screening for fast pagination; the page makes batched follow-up '
  'queries to enrich with mls_listings + analyses info for only the visible rows.';

commit;
