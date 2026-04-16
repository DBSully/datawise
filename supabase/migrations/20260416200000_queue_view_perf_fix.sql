-- Fix statement-timeout on /screening caused by the previous migration
-- (20260416180001) adding an auth.uid()-based computed column to
-- analysis_queue_v. The predicate .is("active_analysis_is_mine", false)
-- couldn't be pushed down past the LATERAL JOIN, so Postgres materialized
-- every row before filtering. With DISTINCT ON over 8k+ screening_results,
-- this exceeded the 8s statement timeout.
--
-- Also fixes a correctness bug: profiles RLS is self-read only
-- (id = auth.uid()), so active_analysis_owner_name returned NULL when
-- the analysis owner was a different analyst. "Reviewed by [name]" never
-- showed a real name.
--
-- Fix:
--   1. Drop the auth.uid() usage from the view. Expose owner_id + owner_name
--      as plain columns; the app computes is-mine by comparing owner_id to
--      session user.id.
--   2. Add a profiles read policy for same-org access, so other analysts'
--      names resolve through the view's lateral join to profiles.

begin;

-- ---------------------------------------------------------------------------
-- Same-org profiles read policy
-- ---------------------------------------------------------------------------

-- Rationale: analyst attribution (who is working on which property) is a
-- team-collaboration feature. Analysts in the same organization should be
-- able to see each other's names. This is the minimum read surface —
-- emails are already exposed via profiles.email for partner invitation
-- flows, and full_name is equally harmless within an org.

drop policy if exists "profiles_read_same_org" on public.profiles;

create policy "profiles_read_same_org"
  on public.profiles
  for select
  to authenticated
  using (
    organization_id = (
      select p.organization_id
        from public.profiles p
       where p.id = auth.uid()
       limit 1
    )
  );

-- ---------------------------------------------------------------------------
-- analysis_queue_v — without auth.uid()
-- ---------------------------------------------------------------------------

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

  -- Active-analysis attribution. The app determines "is mine" by
  -- comparing active_analysis_owner_id to the session user's id, and
  -- applies the default filter via .or() at query time rather than
  -- through a view-computed column. No auth.uid() in here.
  case when aa.analysis_id is not null then true else false end as has_active_analysis,
  aa.analysis_id                             as active_analysis_id,
  aa.lifecycle_stage                         as active_lifecycle_stage,
  aa.interest_level                          as active_interest_level,
  aa.owner_id                                as active_analysis_owner_id,
  coalesce(aa.owner_name, aa.owner_email)    as active_analysis_owner_name,

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
    ap.interest_level,
    p.full_name          as owner_name,
    p.email              as owner_email
  from public.analyses a
  join public.analysis_pipeline ap on ap.analysis_id = a.id
  left join public.profiles p on p.id = a.created_by_user_id
  where a.real_property_id = sr.real_property_id
    and ap.disposition in ('active', 'closed')
  order by a.created_at desc
  limit 1
) aa on true
order by sr.real_property_id, sr.created_at desc;

commit;
