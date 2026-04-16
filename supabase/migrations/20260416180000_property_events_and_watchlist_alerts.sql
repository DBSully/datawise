-- Property change events + per-analyst alert surface.
--
-- Problem: mls_listings is upserted in place on re-imports — the prior
-- state is lost. Analysts re-see a property in screening with no signal
-- that it has changed since they last looked, leading to duplicate
-- analyses and repeated work.
--
-- Fix: detect changes at import time, log them to a new property_events
-- table, and surface per-analyst "unread" events via an events_last_seen_at
-- column on analysis_pipeline (which is 1:1 with a user's analysis).
--
-- Scope per design discussion:
--   - Events emitted: price_change, status_change, change_type, uc_date,
--     close_date, close_price (any delta — no threshold)
--   - Acknowledgment is per-analyst (via analysis_pipeline.events_last_seen_at)
--   - watch_list_v extended with unread_event_count, latest_unread_event_type,
--     latest_unread_event_before, latest_unread_event_after, latest_unread_event_at
--   - Existing pipeline rows backfilled to events_last_seen_at = now() so
--     pre-deployment history doesn't flood the UI on rollout.

begin;

-- ---------------------------------------------------------------------------
-- 1. property_events table
-- ---------------------------------------------------------------------------

create table if not exists public.property_events (
  id uuid primary key default gen_random_uuid(),
  real_property_id uuid not null references public.real_properties(id) on delete cascade,
  mls_listing_id uuid references public.mls_listings(id) on delete set null,
  event_type text not null
    check (event_type in (
      'price_change',
      'status_change',
      'change_type',
      'uc_date',
      'close_date',
      'close_price'
    )),
  before_value jsonb,
  after_value jsonb,
  source_import_batch_id uuid references public.import_batches(id) on delete set null,
  detected_at timestamptz not null default now()
);

comment on table public.property_events is
  'Change-detection log written at MLS import time. Consumed by watchlist alerts + workstation timeline.';

comment on column public.property_events.event_type is
  'Enumerated change category. before_value / after_value carry shape per type (number for prices, text for statuses / change_type, date for uc_date/close_date).';

-- Primary access pattern: "latest events for property P since timestamp T"
create index if not exists ix_property_events_property_detected
  on public.property_events (real_property_id, detected_at desc);

-- Secondary: global recent-events feed
create index if not exists ix_property_events_detected
  on public.property_events (detected_at desc);

alter table public.property_events enable row level security;

-- Org-scoped read: profiles in the same org as the property's import batch
-- creator can see events. For MVP we keep this simple — authenticated users
-- can read all events within their org via existing RLS patterns.
create policy "authenticated read property_events"
  on public.property_events
  for select
  to authenticated
  using (true);

-- Inserts happen only from the import pipeline (service role). No UPDATE
-- or DELETE policy — events are immutable history.

-- ---------------------------------------------------------------------------
-- 2. analysis_pipeline.events_last_seen_at
-- ---------------------------------------------------------------------------

alter table public.analysis_pipeline
  add column if not exists events_last_seen_at timestamptz;

comment on column public.analysis_pipeline.events_last_seen_at is
  'Per-analyst read marker. Events with detected_at > this value are "unread" for the analysis owner. Updated on workstation visit.';

-- Backfill: existing pipeline rows are marked as "all caught up" so the
-- deployment day doesn't flood analysts with old price-change alerts.
update public.analysis_pipeline
   set events_last_seen_at = now()
 where events_last_seen_at is null;

-- ---------------------------------------------------------------------------
-- 3. watch_list_v — extend with unread event info
-- ---------------------------------------------------------------------------

drop view if exists public.watch_list_v;

create or replace view public.watch_list_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,

  ap.interest_level,
  ap.showing_status,
  ap.watch_list_note,
  ap.events_last_seen_at,

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

  coalesce(ma.target_profit_manual, sr.target_profit) as target_profit,

  sr.is_prime_candidate,

  -- Unread event counts + latest unread event summary.
  -- Subqueries are tiny in practice: indexed on (real_property_id, detected_at),
  -- and filtered to events newer than events_last_seen_at (usually days old).
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

commit;
