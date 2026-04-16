-- Denormalize comparable_search_candidates counts onto screening_results.
-- See CHANGELOG 2026-04-16 "Watch List Query Denormalization" entry.
--
-- Before: watch_list_v used a LATERAL join that ran a COUNT(*) aggregate
--         with filter on comparable_search_candidates once per row. For
--         294 rows this was 52% of query time (~588ms), reading 1,757
--         pages from disk. Confirmed via EXPLAIN ANALYZE.
--
-- After:  screening_results carries comps_total + comps_selected directly.
--         The view reads them in-line. A trigger on
--         comparable_search_candidates keeps the counts in sync on every
--         INSERT / UPDATE of selected_yn / DELETE.
--
-- Tradeoff: small write overhead on comp toggles (one UPDATE targeting an
-- indexed lookup + two COUNTs on an indexed column). Reads are infinitely
-- more frequent, so this is the right tradeoff.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema: add denormalized columns
-- ---------------------------------------------------------------------------

alter table public.screening_results
  add column if not exists comps_total    integer not null default 0,
  add column if not exists comps_selected integer not null default 0;

comment on column public.screening_results.comps_total is
  'Denormalized total comp candidates linked via comp_search_run_id. Maintained by trg_csc_sync_screening_counts.';

comment on column public.screening_results.comps_selected is
  'Denormalized selected comp candidates (selected_yn = true). Maintained by trg_csc_sync_screening_counts.';

-- ---------------------------------------------------------------------------
-- 2. Trigger: keep counts in sync
-- ---------------------------------------------------------------------------

create or replace function public.sync_screening_result_comp_counts()
returns trigger
language plpgsql
as $$
declare
  target_run_id uuid;
begin
  -- Handle INSERT/UPDATE (use NEW) vs DELETE (use OLD)
  target_run_id := case tg_op
    when 'DELETE' then OLD.comparable_search_run_id
    else NEW.comparable_search_run_id
  end;

  if target_run_id is null then
    return null;
  end if;

  update public.screening_results sr
     set comps_total = (
           select count(*)::int
             from public.comparable_search_candidates
            where comparable_search_run_id = target_run_id
         ),
         comps_selected = (
           select count(*)::int
             from public.comparable_search_candidates
            where comparable_search_run_id = target_run_id
              and selected_yn
         )
   where sr.comp_search_run_id = target_run_id;

  return null;
end;
$$;

-- Fire on INSERT, DELETE, or UPDATE of selected_yn specifically — we don't
-- need to re-count for other column changes. comparable_search_run_id is
-- effectively immutable after insert, so we don't track it.
drop trigger if exists trg_csc_sync_screening_counts
  on public.comparable_search_candidates;

create trigger trg_csc_sync_screening_counts
  after insert or delete or update of selected_yn
  on public.comparable_search_candidates
  for each row
  execute function public.sync_screening_result_comp_counts();

-- ---------------------------------------------------------------------------
-- 3. Backfill existing rows
-- ---------------------------------------------------------------------------

-- Single pass: aggregate comp counts per run_id, then hash-join to
-- screening_results. Much faster than a correlated subquery.
update public.screening_results sr
   set comps_total    = agg.total_count,
       comps_selected = agg.selected_count
  from (
    select comparable_search_run_id,
           count(*)::int                                   as total_count,
           count(*) filter (where selected_yn)::int        as selected_count
      from public.comparable_search_candidates
     where comparable_search_run_id is not null
     group by comparable_search_run_id
  ) agg
 where sr.comp_search_run_id = agg.comparable_search_run_id;

-- ---------------------------------------------------------------------------
-- 4. Redefine watch_list_v to read denormalized counts directly
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

  -- Denormalized counts — was a lateral join, now in-row on screening_results
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

  sr.is_prime_candidate

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
