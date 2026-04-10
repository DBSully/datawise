-- IMPORTANT: drop the view first. The new shape removes and reorders columns
-- from the original view, and Postgres `create or replace view` only allows
-- appending columns at the end.
drop view if exists public.watch_list_v;

-- Expand watch_list_v with all columns required by the deals/watchlist table:
--   subdivision, change type, DOM (live), list date, live list price,
--   level class, year, bed, bath, garage, sqft breakdown, lot size,
--   ARV, max offer, recomputed offer % and gap/sqft against live list price,
--   target profit (with manual override).
--
-- Notes
-- * list_price prefers the latest mls_listings.list_price; falls back to
--   sr.subject_list_price (the snapshot from screening) only when there is
--   no MLS row at all.
-- * dom: pending/closed -> purchase_contract_date - listing_contract_date.
--        active/coming soon -> greatest(0, current_date - listing_contract_date + 1)
--        (inclusive of list date so an active listing posted today shows 1;
--         a coming-soon listing dated in the future shows 0).
-- * gap_per_sqft and offer_pct are recomputed against the LIVE list price so
--   the table always reflects current data, not the screening snapshot.
-- * target_profit prefers manual_analysis.target_profit_manual when set.

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

  -- Current list price: prefer live MLS price, fall back to subject snapshot
  coalesce(ml.list_price, sr.subject_list_price) as list_price,

  -- Days on market
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

  -- Comp counts: selected ARV comps / total candidates from the comp search run
  cmp.comps_selected,
  cmp.comps_total,

  -- Offer % against live list price
  case
    when coalesce(ml.list_price, sr.subject_list_price) > 0
      then sr.max_offer / coalesce(ml.list_price, sr.subject_list_price)
    else null
  end as offer_pct,

  -- Gap = (ARV - list_price) / building_area_total_sqft
  case
    when pp.building_area_total_sqft > 0 and sr.arv_aggregate is not null
      then (sr.arv_aggregate - coalesce(ml.list_price, sr.subject_list_price)) / pp.building_area_total_sqft
    else null
  end as gap_per_sqft,

  -- Target profit (manual override wins)
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
left join lateral (
  select
    count(*)::int as comps_total,
    count(*) filter (where csc.selected_yn)::int as comps_selected
  from public.comparable_search_candidates csc
  where csc.comparable_search_run_id = sr.comp_search_run_id
) cmp on true
where ap.disposition = 'active'
  and ap.lifecycle_stage in ('analysis', 'screening');
