-- Phase 1 Step 2 — Migration 5 (final)
-- Recreate all 13 views with security_invoker = true.
--
-- By default, Postgres views run with the privileges of the view's
-- OWNER, which means they bypass the calling user's RLS policies.
-- Before this migration, the views in this project returned rows
-- across all orgs, ignoring the new Task 4 org-scoped policies.
--
-- Setting security_invoker = true makes views run with the CALLING
-- USER's privileges, including their RLS policies. This means the
-- same org-scoped policies we added in Task 4 automatically filter
-- view results — no view definition changes required.
--
-- For DataWiseRE today (single org, single user) the observable
-- behavior is unchanged — Dan can see everything in his own org
-- either way. The change matters when a second org or a partner
-- role exists: they would see only their own scoped rows through
-- these views.
--
-- Why ALTER VIEW SET instead of DROP + RECREATE:
-- ALTER VIEW ... SET (security_invoker = true) is a metadata-only
-- change that preserves the view definition and any dependent
-- objects. Dropping and recreating would invalidate any code that
-- holds a reference to the view oid, and would require copying
-- the full view definitions (which have evolved across several
-- migrations over time). Cleaner and safer to flip the flag.
--
-- Metadata-only, no row scans, no long locks. Expected runtime: <1s.

ALTER VIEW public.analysis_queue_v             SET (security_invoker = true);
ALTER VIEW public.watch_list_v                 SET (security_invoker = true);
ALTER VIEW public.pipeline_v                   SET (security_invoker = true);
ALTER VIEW public.closed_deals_v               SET (security_invoker = true);
ALTER VIEW public.dashboard_pipeline_summary_v SET (security_invoker = true);
ALTER VIEW public.daily_activity_v             SET (security_invoker = true);
ALTER VIEW public.import_outcomes_v            SET (security_invoker = true);
ALTER VIEW public.import_batch_progress_v      SET (security_invoker = true);
ALTER VIEW public.property_browser_v           SET (security_invoker = true);
ALTER VIEW public.property_city_options_v      SET (security_invoker = true);
ALTER VIEW public.property_status_options_v    SET (security_invoker = true);
ALTER VIEW public.property_type_options_v      SET (security_invoker = true);
ALTER VIEW public.mls_status_counts_v          SET (security_invoker = true);
