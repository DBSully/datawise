-- Pipeline view: deals in active deal-making stages
create or replace view public.pipeline_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,
  a.scenario_name,
  a.strategy_type,

  ap.lifecycle_stage,
  ap.disposition,
  ap.interest_level,
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

  -- Days since last pipeline update
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


-- Closed deals view: both won and lost
create or replace view public.closed_deals_v
with (security_invoker = true) as
select
  a.id as analysis_id,
  a.real_property_id,
  a.scenario_name,
  a.strategy_type,

  ap.lifecycle_stage,
  ap.disposition,
  ap.interest_level,
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
