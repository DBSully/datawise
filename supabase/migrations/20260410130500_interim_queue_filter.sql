-- Phase 1 — Interim Queue Fix (between Step 2 and Step 3)
--
-- Hide already-promoted properties from the default screening queue,
-- and expose "this property has newer screening data than its analysis"
-- as a column so the UI can surface the signal.
--
-- ─── The bug being fixed ───
-- The previous analysis_queue_v showed the latest screening_results
-- row per property and the page filtered by review_action IS NULL.
-- When a property was promoted to the watch list, its screening_results
-- row got review_action = 'promoted' and was correctly hidden.
-- BUT when the property was later re-screened (new batch run), a NEW
-- screening_results row was created for that property with
-- review_action = NULL by default, and DISTINCT ON (real_property_id)
-- ORDER BY created_at DESC picked the new row over the old promoted
-- one. The new row passed the page's review_action IS NULL filter,
-- and the property reappeared in the default queue as if it had never
-- been reviewed. Diagnostic confirmed 127 stale entries in the queue.
--
-- ─── The fix ───
-- The view now LEFT JOIN LATERAL to find the most recent active analysis
-- for each property (matching watch_list_v's "active" definition:
-- disposition IN ('active', 'closed'), excluding 'passed' so passes
-- still surface in the queue when toggled).
--
-- New columns added to the view:
--   has_active_analysis              — boolean, true if property has any active pipeline row
--   active_analysis_id               — uuid of the most recent active analysis
--   active_lifecycle_stage           — text, the lifecycle stage of that analysis
--   active_interest_level            — text, the interest level on that pipeline row
--   has_newer_screening_than_analysis — boolean, true if this screening row was
--                                       created after the analysis. Used to surface
--                                       "you have new data" on watch list items.
--
-- The page-side filter (in app/(workspace)/screening/page.tsx) is updated
-- to add `.is("has_active_analysis", false)` when "Show Reviewed" is off,
-- which is what actually hides the stale rows from the default view.
--
-- ─── Why this is interim ───
-- The full Option C from the discussion (proactive alerts on watch list
-- items when new data arrives) is Step 3 / Phase 2 work. This view-level
-- fix solves the immediate "ghost properties in the queue" problem and
-- exposes the data the future alert system will need, but doesn't yet
-- ship a true alert UX. That comes in Step 3 with the new Workstation
-- card layout per WORKSTATION_CARD_SPEC.md.

DROP VIEW IF EXISTS public.analysis_queue_v;

CREATE VIEW public.analysis_queue_v
WITH (security_invoker = true) AS
SELECT DISTINCT ON (sr.real_property_id)
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

  -- ─── NEW columns (interim queue fix) ───

  -- Whether this property has any active or closed analysis (i.e. on watch
  -- list, in pipeline, or already a closed deal). Used by the page-side
  -- filter to hide already-claimed properties from the default queue.
  CASE WHEN aa.analysis_id IS NOT NULL THEN true ELSE false END AS has_active_analysis,

  -- The most recent active/closed analysis for this property (NULL if none).
  -- Used to provide a correct "open analysis" link from the queue badge,
  -- replacing the unreliable per-row promoted_analysis_id which can be NULL
  -- on re-screened rows.
  aa.analysis_id      AS active_analysis_id,
  aa.lifecycle_stage  AS active_lifecycle_stage,
  aa.interest_level   AS active_interest_level,

  -- Whether the latest screening for this property happened AFTER the
  -- analysis was created. Used to surface "this watch list item has
  -- newer data than when you promoted it" in Show Reviewed mode.
  CASE
    WHEN aa.analysis_created_at IS NULL          THEN false
    WHEN sr.created_at > aa.analysis_created_at  THEN true
    ELSE false
  END AS has_newer_screening_than_analysis

FROM public.screening_results sr
LEFT JOIN LATERAL (
  SELECT
    mls.mls_status,
    mls.mls_major_change_type,
    mls.listing_contract_date
  FROM public.mls_listings mls
  WHERE mls.real_property_id = sr.real_property_id
  ORDER BY mls.listing_contract_date DESC NULLS FIRST, mls.created_at DESC
  LIMIT 1
) ml ON true
LEFT JOIN LATERAL (
  -- Find the most recent active or closed analysis for this property.
  -- We exclude disposition = 'passed' so passed properties remain
  -- reviewable in the queue (the page-side review_action filter still
  -- hides them by default but they show up when "Show Reviewed" is on).
  SELECT
    a.id          AS analysis_id,
    a.created_at  AS analysis_created_at,
    ap.lifecycle_stage,
    ap.interest_level
  FROM public.analyses a
  JOIN public.analysis_pipeline ap ON ap.analysis_id = a.id
  WHERE a.real_property_id = sr.real_property_id
    AND ap.disposition IN ('active', 'closed')
  ORDER BY a.created_at DESC
  LIMIT 1
) aa ON true
ORDER BY sr.real_property_id, sr.created_at DESC;
