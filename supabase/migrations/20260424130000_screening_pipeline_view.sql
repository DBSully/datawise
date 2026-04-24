-- Pipeline view — wraps screening_results with the caller's active-analysis
-- info exposed as columns. Replaces screening_queue_v (which did the same
-- thing as a NOT EXISTS exclusion and is no longer used by the app).
--
-- The view-mode chips on /pipeline (My Focus, Screening, Action, All) need
-- a server-side filter to partition by "is the caller working on this?"
-- without fetching a long IN-list of UUIDs and hitting the PostgREST URL
-- trap (~200 UUIDs = fetch failed). This view solves it by embedding
-- auth.uid() inside a LATERAL join; the app filters with plain column
-- predicates (`.eq("has_caller_active_analysis", true)` etc.).
--
-- Scope note: we wrap raw screening_results (NOT the latest-per-property
-- view) so the same view serves two query modes:
--   - Default mode: app adds `.eq("is_latest_for_property", true)` — the
--     maintained flag from migration 20260416260000.
--   - Batch mode: app adds `.eq("screening_batch_id", X)` — all results
--     in that batch, including stale ones. User explicitly requested
--     batch filter semantics to be "everything in the batch," not
--     "latest-per-property filtered-to-batch."
--
-- Perf: LATERAL runs per row. The app never queries screening_pipeline_v
-- unfiltered — it's always narrowed to ~200 rows by page-size and filters.
-- Indexes used: ix_analyses_property_user, ix_screening_results_latest_by_property,
-- ix_screening_results_is_latest (partial), and the PKs on analysis_pipeline.

begin;

-- ---------------------------------------------------------------------------
-- Drop the unused exclusion-style view first (clean up after step 2b).
-- ---------------------------------------------------------------------------

drop view if exists public.screening_queue_v;

-- ---------------------------------------------------------------------------
-- screening_pipeline_v
-- ---------------------------------------------------------------------------

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

  -- Caller's active analysis on this property, if any. NULL when the
  -- signed-in user has no non-archived, active/closed analysis. Used by
  -- the view-mode chips to partition the queue without an IN-list of
  -- UUIDs from the client.
  caa.analysis_id         as caller_active_analysis_id,
  caa.interest_level      as caller_active_interest_level,
  caa.lifecycle_stage     as caller_active_lifecycle_stage,
  caa.showing_status      as caller_active_showing_status,
  caa.offer_status        as caller_active_offer_status,
  caa.events_last_seen_at as caller_events_last_seen_at,
  (caa.analysis_id is not null) as has_caller_active_analysis

from public.screening_results sr
left join lateral (
  select
    a.id                   as analysis_id,
    ap.lifecycle_stage,
    ap.interest_level,
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
  'Used by /pipeline for server-side view-mode partitioning (My Focus / '
  'Screening / Action / All) without IN-list UUIDs on the query URL.';

commit;
