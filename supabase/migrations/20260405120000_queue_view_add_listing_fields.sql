-- Add MLS status and listing contract date to the analysis queue view
-- by joining screening_results.listing_row_id → mls_listings
-- Must drop + recreate because column order changes.

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
