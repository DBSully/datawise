-- Watch List view: joins all data needed for the deals/watchlist page
create or replace view public.watch_list_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,
  a.scenario_name,
  a.strategy_type,
  a.created_at as analysis_created_at,

  ap.interest_level,
  ap.showing_status,
  ap.offer_status,
  ap.lifecycle_stage,
  ap.disposition,
  ap.promoted_at,
  ap.watch_list_note,
  ap.promoted_from_screening_result_id,
  ap.updated_at as pipeline_updated_at,

  rp.unparsed_address,
  rp.city,

  pp.property_type,
  pp.building_area_total_sqft,
  pp.bedrooms_total,
  pp.bathrooms_total,
  pp.year_built,

  sr.arv_aggregate,
  sr.max_offer,
  sr.est_gap_per_sqft,
  sr.offer_pct,
  sr.arv_comp_count,
  sr.rehab_total,
  sr.subject_list_price,
  sr.trend_annual_rate,
  sr.is_prime_candidate,

  ml.mls_status,
  ml.list_price as current_list_price,

  -- Days on watch list (from promotion date)
  case
    when ap.promoted_at is not null
    then extract(day from now() - ap.promoted_at)::int
    else extract(day from now() - a.created_at)::int
  end as days_on_watch_list

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
  and ap.lifecycle_stage in ('analysis', 'screening');
