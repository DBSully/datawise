-- Extend screening_pipeline_v with caller_active_disposition.
--
-- The single-pill stage logic shipping next needs to distinguish active
-- deals from closed ones so it can render Won / Lost pills on closed
-- deals and stage pills (Hot / Anl / Ofr / etc.) on active ones. The
-- view already joins to analysis_pipeline and filters to disposition
-- in ('active', 'closed') — we just need to surface which one it is.
--
-- Won vs Lost within disposition='closed' is derivable from whether an
-- accepted offer exists on the analysis, which the app resolves in a
-- follow-up query against analysis_offers. Closed-without-accepted = Lost.

begin;

create or replace view public.screening_pipeline_v
with (security_invoker = true) as
select
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
  sr.trend_raw_rate,
  sr.trend_confidence,
  sr.trend_detail_json,
  sr.review_action,
  sr.reviewed_at,
  sr.pass_reason,
  sr.screening_updated_at,
  sr.created_at,
  sr.is_latest_for_property,
  sr.latest_mls_status,
  sr.latest_mls_major_change_type,
  sr.latest_listing_contract_date,

  -- Caller's active analysis, if any. Active OR closed — the pill logic
  -- differentiates via caller_active_disposition (appended below; column
  -- order matters for CREATE OR REPLACE VIEW).
  caa.analysis_id         as caller_active_analysis_id,
  caa.interest_level      as caller_active_interest_level,
  caa.lifecycle_stage     as caller_active_lifecycle_stage,
  caa.showing_status      as caller_active_showing_status,
  caa.offer_status        as caller_active_offer_status,
  caa.events_last_seen_at as caller_events_last_seen_at,
  (caa.analysis_id is not null) as has_caller_active_analysis,

  -- Appended 2026-04-24 for the Closed view chip + single-pill Won/Lost
  -- rendering. CREATE OR REPLACE forbids reordering existing columns.
  caa.disposition         as caller_active_disposition

from public.screening_results sr
left join lateral (
  select
    a.id                   as analysis_id,
    ap.lifecycle_stage,
    ap.interest_level,
    ap.disposition,
    ap.showing_status,
    ap.offer_status,
    ap.events_last_seen_at
  from public.analyses a
  join public.analysis_pipeline ap on ap.analysis_id = a.id
  where a.real_property_id = sr.real_property_id
    and a.created_by_user_id = auth.uid()
    and a.is_archived = false
    and ap.disposition in ('active', 'closed')
  order by a.created_at desc
  limit 1
) caa on true;

comment on view public.screening_pipeline_v is
  'Pipeline view — screening_results + caller-scoped active-analysis columns. '
  'Used by /pipeline for server-side view-mode partitioning (Focus / '
  'Screening / Action / Closed / All) without IN-list UUIDs on the query URL.';

commit;
