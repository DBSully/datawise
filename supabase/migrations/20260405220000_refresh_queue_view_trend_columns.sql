-- Recreate analysis_queue_v so it picks up the trend_* columns
-- added to screening_results after the view was originally created.
-- PostgreSQL resolves SELECT * at view creation time, so new columns
-- require a drop + recreate.

drop view if exists public.analysis_queue_v;

create view public.analysis_queue_v as
select distinct on (sr.real_property_id)
  sr.*,
  ml.mls_status,
  ml.listing_contract_date,
  sb.name as batch_name,
  sb.strategy_profile_slug
from public.screening_results sr
join public.screening_batches sb on sr.screening_batch_id = sb.id
left join public.mls_listings ml on sr.listing_row_id = ml.id
where sr.screening_status in ('screened')
  and sb.status = 'complete'
order by sr.real_property_id, sr.created_at desc;
