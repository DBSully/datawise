-- Three-gate decision model — separate screener, analyst, and partner authority.
--
-- Replaces the single overloaded `interest_level` field on analysis_pipeline
-- and the binary `review_action` field on screening_results with role-distinct
-- columns:
--
--   screening_results.screener_decision     ('fail' | 'review' | 'fast_track')
--   analysis_pipeline.analyst_interest      ('hot' | 'warm' | 'watch' | 'pass')
--   partner_feedback (already exists)        — derived as a rollup in views
--
-- Migration rules (per user 2026-04-25):
--   1. Failed screening (review_action='passed') → screener_decision='fail',
--      preserve the prior pass_reason as screener_decision_reason.
--   2. Promoted screening with analyst_pipeline.interest_level='hot' →
--      screener_decision='fast_track' (analyst's prior Hot enthusiasm
--      reads as a screener-level fast-track signal).
--   3. All other promoted screening rows → screener_decision='review'.
--   4. analyst_interest is NOT backfilled — every promoted row starts NULL
--      so the analyst re-classifies deliberately under the new model. User
--      explicitly accepts the lost-data tradeoff.
--   5. The screener's decision is durable. Analyst overrides DO NOT modify
--      screener_decision; overriding a Failed row creates an analysis but
--      preserves the Fail call for audit / calibration analytics.
--
-- View dependencies recreated (legacy columns dropped → all four views must
-- be redefined with new column names):
--   screening_results_latest_v
--   analysis_queue_v
--   watch_list_v
--   screening_pipeline_v  (also gains partner rollup columns)

begin;

-- ---------------------------------------------------------------------------
-- 1. New columns on screening_results
-- ---------------------------------------------------------------------------

alter table public.screening_results
  add column if not exists screener_decision text,
  add column if not exists screener_decision_reason text,
  add column if not exists screener_decided_at timestamptz,
  add column if not exists screener_decided_by uuid references auth.users(id);

alter table public.screening_results
  add constraint chk_screening_results_screener_decision
  check (screener_decision is null or screener_decision in ('fail', 'review', 'fast_track'));

-- ---------------------------------------------------------------------------
-- 2. New columns on analysis_pipeline
-- ---------------------------------------------------------------------------

alter table public.analysis_pipeline
  add column if not exists analyst_interest text,
  add column if not exists analyst_pass_reason text,
  add column if not exists analyst_decided_at timestamptz,
  add column if not exists analyst_decided_by uuid references auth.users(id);

alter table public.analysis_pipeline
  add constraint chk_analysis_pipeline_analyst_interest
  check (analyst_interest is null or analyst_interest in ('hot', 'warm', 'watch', 'pass'));

-- ---------------------------------------------------------------------------
-- 3. Backfill — failed screening rows
-- ---------------------------------------------------------------------------

update public.screening_results
   set screener_decision        = 'fail',
       screener_decision_reason = pass_reason,
       screener_decided_at      = reviewed_at,
       screener_decided_by      = reviewed_by_user_id
 where review_action = 'passed';

-- ---------------------------------------------------------------------------
-- 4. Backfill — promoted rows. Hot interest → fast_track, else review.
-- ---------------------------------------------------------------------------

update public.screening_results sr
   set screener_decision   = case when ap.interest_level = 'hot' then 'fast_track' else 'review' end,
       screener_decided_at = sr.reviewed_at,
       screener_decided_by = sr.reviewed_by_user_id
  from public.analysis_pipeline ap
 where ap.analysis_id = sr.promoted_analysis_id
   and sr.review_action = 'promoted';

-- Defensive: any promoted rows whose join failed (shouldn't exist).
update public.screening_results
   set screener_decision   = 'review',
       screener_decided_at = reviewed_at,
       screener_decided_by = reviewed_by_user_id
 where review_action = 'promoted'
   and screener_decision is null;

-- ---------------------------------------------------------------------------
-- 5. Drop dependent views before dropping columns.
-- ---------------------------------------------------------------------------

drop view if exists public.screening_pipeline_v;
drop view if exists public.analysis_queue_v;
drop view if exists public.watch_list_v;
drop view if exists public.screening_results_latest_v;
drop view if exists public.daily_activity_v;
drop view if exists public.pipeline_v;
drop view if exists public.closed_deals_v;

-- ---------------------------------------------------------------------------
-- 6. Drop legacy columns + indexes + constraints
-- ---------------------------------------------------------------------------

alter table public.screening_results
  drop constraint if exists chk_screening_results_review_action;
drop index if exists public.ix_screening_results_review_action;

alter table public.screening_results
  drop column if exists review_action,
  drop column if exists pass_reason,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by_user_id;

drop index if exists public.ix_analysis_pipeline_interest_level;

alter table public.analysis_pipeline
  drop column if exists interest_level;

-- ---------------------------------------------------------------------------
-- 7. New indexes
-- ---------------------------------------------------------------------------

create index if not exists ix_screening_results_screener_decision
  on public.screening_results (screener_decision);

create index if not exists ix_analysis_pipeline_analyst_interest
  on public.analysis_pipeline (analyst_interest)
  where analyst_interest is not null;

-- ---------------------------------------------------------------------------
-- 8. Recreate screening_results_latest_v (was 20260416340000)
-- ---------------------------------------------------------------------------

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
  screener_decision,
  screener_decision_reason,
  screener_decided_at,
  screening_updated_at,
  created_at,
  latest_mls_status,
  latest_mls_major_change_type,
  latest_listing_contract_date
from public.screening_results
where is_latest_for_property = true;

-- ---------------------------------------------------------------------------
-- 9. Recreate analysis_queue_v (was 20260416220000)
-- ---------------------------------------------------------------------------

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
  sr.screener_decision,
  sr.screener_decided_at,
  sr.screener_decision_reason,
  sr.screening_updated_at,
  ml.mls_status,
  ml.mls_major_change_type,
  ml.listing_contract_date,

  case when aa.analysis_id is not null then true else false end as has_active_analysis,
  aa.analysis_id          as active_analysis_id,
  aa.lifecycle_stage      as active_lifecycle_stage,
  aa.analyst_interest     as active_analyst_interest,
  aa.owner_id             as active_analysis_owner_id,

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
    ap.analyst_interest
  from public.analyses a
  join public.analysis_pipeline ap on ap.analysis_id = a.id
  where a.real_property_id = sr.real_property_id
    and ap.disposition in ('active', 'closed')
  order by a.created_at desc
  limit 1
) aa on true
order by sr.real_property_id, sr.created_at desc;

-- ---------------------------------------------------------------------------
-- 10. Recreate watch_list_v (was 20260416180000)
-- ---------------------------------------------------------------------------

create view public.watch_list_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,

  ap.analyst_interest,
  ap.showing_status,
  ap.watch_list_note,
  ap.events_last_seen_at,
  ap.updated_at as pipeline_updated_at,

  rp.unparsed_address,
  rp.city,
  rp.lot_size_sqft,

  ml.subdivision_name,
  ml.mls_major_change_type,
  ml.listing_contract_date,
  ml.mls_status,

  coalesce(ml.list_price, sr.subject_list_price) as list_price,

  case
    when ml.purchase_contract_date is not null and ml.listing_contract_date is not null
      then (ml.purchase_contract_date - ml.listing_contract_date)::int
    when ml.listing_contract_date is not null
      then greatest(0, (current_date - ml.listing_contract_date + 1))::int
    else null
  end as dom,

  pp.level_class_standardized,
  pp.year_built,
  pp.bedrooms_total,
  pp.bathrooms_total,
  pp.garage_spaces,
  pp.building_area_total_sqft,
  pp.above_grade_finished_area_sqft,
  pp.below_grade_total_sqft,
  pp.below_grade_finished_area_sqft,

  sr.arv_aggregate,
  sr.max_offer,

  sr.comps_selected,
  sr.comps_total,

  case
    when coalesce(ml.list_price, sr.subject_list_price) > 0
      then sr.max_offer / coalesce(ml.list_price, sr.subject_list_price)
    else null
  end as offer_pct,

  case
    when pp.building_area_total_sqft > 0 and sr.arv_aggregate is not null
      then (sr.arv_aggregate - coalesce(ml.list_price, sr.subject_list_price)) / pp.building_area_total_sqft
    else null
  end as gap_per_sqft,

  -- est_gap_per_sqft surfaced through for the dashboard's watchlist alerts.
  sr.est_gap_per_sqft,

  coalesce(ma.target_profit_manual, sr.target_profit) as target_profit,

  sr.is_prime_candidate,

  -- Unread event counts + latest unread event summary.
  (
    select count(*)::int
      from public.property_events pe
     where pe.real_property_id = a.real_property_id
       and pe.detected_at > coalesce(ap.events_last_seen_at, ap.promoted_at, a.created_at)
  ) as unread_event_count,

  (
    select pe.event_type
      from public.property_events pe
     where pe.real_property_id = a.real_property_id
       and pe.detected_at > coalesce(ap.events_last_seen_at, ap.promoted_at, a.created_at)
     order by pe.detected_at desc
     limit 1
  ) as latest_unread_event_type,

  (
    select pe.before_value
      from public.property_events pe
     where pe.real_property_id = a.real_property_id
       and pe.detected_at > coalesce(ap.events_last_seen_at, ap.promoted_at, a.created_at)
     order by pe.detected_at desc
     limit 1
  ) as latest_unread_event_before,

  (
    select pe.after_value
      from public.property_events pe
     where pe.real_property_id = a.real_property_id
       and pe.detected_at > coalesce(ap.events_last_seen_at, ap.promoted_at, a.created_at)
     order by pe.detected_at desc
     limit 1
  ) as latest_unread_event_after,

  (
    select pe.detected_at
      from public.property_events pe
     where pe.real_property_id = a.real_property_id
       and pe.detected_at > coalesce(ap.events_last_seen_at, ap.promoted_at, a.created_at)
     order by pe.detected_at desc
     limit 1
  ) as latest_unread_event_at

from public.analyses a
join public.analysis_pipeline ap on ap.analysis_id = a.id
join public.real_properties rp on rp.id = a.real_property_id
left join public.property_physical pp on pp.real_property_id = a.real_property_id
left join public.screening_results sr
  on sr.id = ap.promoted_from_screening_result_id
left join public.manual_analysis ma on ma.analysis_id = a.id
left join lateral (
  select
    mls.subdivision_name,
    mls.mls_major_change_type,
    mls.listing_contract_date,
    mls.purchase_contract_date,
    mls.list_price,
    mls.mls_status
  from public.mls_listings mls
  where mls.real_property_id = a.real_property_id
  order by mls.listing_contract_date desc nulls last, mls.created_at desc
  limit 1
) ml on true
where ap.disposition = 'active'
  and ap.lifecycle_stage in ('analysis', 'screening');

-- ---------------------------------------------------------------------------
-- 11. Recreate screening_pipeline_v with three-gate columns + partner rollup.
--
-- Partner rollup rule (per user 2026-04-25):
--   1. Any partner_feedback row with action='interested' → 'interested' wins.
--   2. Otherwise, the most-recent feedback action.
--   3. NULL when no partner has weighed in.
--
-- A click/hover surface in the UI exposes the full partner_feedback history;
-- this view only carries the rolled-up summary.
-- ---------------------------------------------------------------------------

create view public.screening_pipeline_v
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
  sr.screener_decision,
  sr.screener_decided_at,
  sr.screener_decision_reason,
  sr.screening_updated_at,
  sr.created_at,
  sr.is_latest_for_property,
  sr.latest_mls_status,
  sr.latest_mls_major_change_type,
  sr.latest_listing_contract_date,

  -- Caller's active analysis on this property, if any.
  caa.analysis_id           as caller_active_analysis_id,
  caa.analyst_interest      as caller_active_analyst_interest,
  caa.analyst_pass_reason   as caller_active_analyst_pass_reason,
  caa.lifecycle_stage       as caller_active_lifecycle_stage,
  caa.disposition           as caller_active_disposition,
  caa.showing_status        as caller_active_showing_status,
  caa.offer_status          as caller_active_offer_status,
  caa.events_last_seen_at   as caller_events_last_seen_at,
  (caa.analysis_id is not null) as has_caller_active_analysis,

  -- Partner rollup: any-Interested wins, else most recent action, else NULL.
  lp.partner_decision,
  lp.partner_feedback_count,
  lp.partner_last_feedback_at

from public.screening_results sr
left join lateral (
  select
    a.id                   as analysis_id,
    ap.lifecycle_stage,
    ap.analyst_interest,
    ap.analyst_pass_reason,
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
) caa on true
left join lateral (
  select
    case
      when bool_or(pf.action = 'interested') then 'interested'
      else (
        select pf2.action
          from public.partner_feedback pf2
          join public.analysis_shares s2 on s2.id = pf2.analysis_share_id
         where s2.analysis_id = caa.analysis_id
         order by pf2.submitted_at desc
         limit 1
      )
    end                       as partner_decision,
    count(*)                  as partner_feedback_count,
    max(pf.submitted_at)      as partner_last_feedback_at
  from public.partner_feedback pf
  join public.analysis_shares s on s.id = pf.analysis_share_id
  where s.analysis_id = caa.analysis_id
) lp on true;

comment on view public.screening_pipeline_v is
  'Pipeline view — three-gate decision model. screener_decision (fail/review/fast_track) '
  'on screening_results, analyst_interest (hot/warm/watch/pass) on analysis_pipeline, '
  'and partner_decision rolled up from partner_feedback (any-Interested wins → most recent → null).';

-- ---------------------------------------------------------------------------
-- 12. Recreate daily_activity_v (was 20260408210000)
-- ---------------------------------------------------------------------------

create view public.daily_activity_v
with (security_invoker = true) as
select
  'screening' as activity_type,
  sr.real_property_id,
  null::uuid as analysis_id,
  rp.unparsed_address as address,
  rp.city,
  sr.is_prime_candidate,
  null::text as strategy_type,
  sr.screener_decision as screening_decision,
  sr.screening_updated_at as activity_at
from public.screening_results sr
join public.real_properties rp on rp.id = sr.real_property_id
where sr.screening_updated_at is not null

union all

select
  'analysis_complete' as activity_type,
  a.real_property_id,
  a.id as analysis_id,
  rp.unparsed_address as address,
  rp.city,
  null::boolean as is_prime_candidate,
  a.strategy_type,
  null::text as screening_decision,
  a.analysis_completed_at as activity_at
from public.analyses a
join public.real_properties rp on rp.id = a.real_property_id
where a.analysis_completed_at is not null

order by activity_at desc;

-- ---------------------------------------------------------------------------
-- 13. Recreate pipeline_v + closed_deals_v (was 20260407120000).
-- Not actively used by app code today, but other tooling may query them
-- and dropping silently would be surprising. Same definition, just with
-- analyst_interest replacing interest_level.
-- ---------------------------------------------------------------------------

create view public.pipeline_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,
  a.scenario_name,
  a.strategy_type,

  ap.lifecycle_stage,
  ap.disposition,
  ap.analyst_interest,
  ap.showing_status,
  ap.offer_status,
  ap.showing_date,
  ap.offer_submitted_date,
  ap.offer_deadline_date,
  ap.offer_accepted_date,
  ap.closed_date,
  ap.watch_list_note,
  ap.promoted_at,
  ap.updated_at as pipeline_updated_at,

  rp.unparsed_address,
  rp.city,

  pp.property_type,

  sr.arv_aggregate,
  sr.max_offer,
  sr.est_gap_per_sqft,
  sr.subject_list_price,

  ml.mls_status,
  ml.list_price as current_list_price,

  extract(day from now() - ap.updated_at)::int as days_since_update

from public.analyses a
join public.analysis_pipeline ap on ap.analysis_id = a.id
join public.real_properties rp on rp.id = a.real_property_id
left join public.property_physical pp on pp.real_property_id = a.real_property_id
left join public.screening_results sr
  on sr.id = ap.promoted_from_screening_result_id
left join lateral (
  select mls.mls_status, mls.list_price
  from public.mls_listings mls
  where mls.real_property_id = a.real_property_id
  order by mls.listing_contract_date desc nulls first, mls.created_at desc
  limit 1
) ml on true
where ap.disposition = 'active'
  and ap.lifecycle_stage in ('showing', 'offer', 'under_contract');


create view public.closed_deals_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,
  a.scenario_name,
  a.strategy_type,

  ap.lifecycle_stage,
  ap.disposition,
  ap.analyst_interest,
  ap.offer_status,
  ap.closed_date,
  ap.promoted_at,
  ap.watch_list_note,
  ap.updated_at as pipeline_updated_at,

  rp.unparsed_address,
  rp.city,

  pp.property_type,

  sr.arv_aggregate,
  sr.max_offer,
  sr.est_gap_per_sqft,
  sr.subject_list_price,

  ml.list_price as current_list_price

from public.analyses a
join public.analysis_pipeline ap on ap.analysis_id = a.id
join public.real_properties rp on rp.id = a.real_property_id
left join public.property_physical pp on pp.real_property_id = a.real_property_id
left join public.screening_results sr
  on sr.id = ap.promoted_from_screening_result_id
left join lateral (
  select mls.list_price
  from public.mls_listings mls
  where mls.real_property_id = a.real_property_id
  order by mls.listing_contract_date desc nulls first, mls.created_at desc
  limit 1
) ml on true
where ap.disposition in ('passed', 'closed')
   or ap.lifecycle_stage in ('closed');

commit;
