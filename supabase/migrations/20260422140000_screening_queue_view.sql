-- Screening Queue view — server-side exclusion of the signed-in user's
-- own active analyses. Solves a URL-length failure mode on the
-- /screening page: the old client pattern fetched every active-analysis
-- real_property_id for the user, then passed all of them as a long IN
-- list on the main queue query. Once the user had enough open
-- analyses (~200+), the Supabase URL exceeded the transport header
-- budget and the whole request died with a "fetch failed" TypeError
-- — not a 414, because the connection dropped before the server
-- could reply.
--
-- This view wraps screening_results_latest_v and embeds the
-- "not mine-and-active" exclusion via NOT EXISTS on auth.uid(). The
-- app queries the view plain — no exclusion list in the URL at all.
--
-- SECURITY_INVOKER = true means the caller's RLS on the underlying
-- screening_results / analyses / analysis_pipeline tables is still
-- enforced, and auth.uid() resolves to the caller inside the
-- subquery. Anonymous callers (auth.uid() IS NULL) see everything,
-- same as the old client-side behaviour (which returned [] for
-- unauthenticated users and skipped the exclusion).
--
-- Perf: the NOT EXISTS subquery hits ix_analyses_property_user
-- (real_property_id, created_by_user_id) and ix_analysis_pipeline
-- on analysis_id (the PK), so the planner handles the predicate via
-- index-only paths.

create or replace view public.screening_queue_v
with (security_invoker = true) as
select slr.*
from public.screening_results_latest_v slr
where not exists (
  select 1
  from public.analyses a
  join public.analysis_pipeline ap on ap.analysis_id = a.id
  where a.real_property_id = slr.real_property_id
    and a.created_by_user_id = auth.uid()
    and a.is_archived = false
    and ap.disposition in ('active', 'closed')
);

comment on view public.screening_queue_v is
  'Screening queue with caller-owned active analyses hidden server-side. '
  'Replaces the client-side not-in-UUID-list pattern that broke on long URLs.';
