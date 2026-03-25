create or replace view public.import_batch_progress_v
with (security_invoker = true) as
select
  b.id,
  b.created_at,
  b.completed_at,
  b.status,
  b.source_system,
  b.import_profile,
  b.file_count,
  b.total_row_count,
  b.unique_listing_count,
  b.unique_property_count,
  b.import_notes,
  coalesce(count(r.id) filter (where r.processing_status = 'processed'), 0)::int as processed_rows,
  coalesce(count(r.id) filter (where r.processing_status = 'validated'), 0)::int as remaining_validated_rows,
  coalesce(count(r.id) filter (where r.processing_status = 'processing_error'), 0)::int as processing_error_rows,
  coalesce(count(r.id) filter (where r.processing_status = 'validation_error'), 0)::int as validation_error_rows,
  case
    when coalesce(b.total_row_count, 0) > 0
      then round(
        (coalesce(count(r.id) filter (where r.processing_status = 'processed'), 0)::numeric
        / b.total_row_count::numeric) * 100,
        1
      )
    else 0
  end as processed_pct
from public.import_batches b
left join public.import_batch_rows r
  on r.import_batch_id = b.id
group by
  b.id,
  b.created_at,
  b.completed_at,
  b.status,
  b.source_system,
  b.import_profile,
  b.file_count,
  b.total_row_count,
  b.unique_listing_count,
  b.unique_property_count,
  b.import_notes;

create or replace view public.property_browser_v
with (security_invoker = true) as
select
  rp.id as real_property_id,
  rp.unparsed_address,
  rp.city,
  rp.state,
  rp.postal_code,
  rp.unit_number,
  rp.created_at as property_created_at,
  rp.updated_at as property_updated_at,
  pp.property_type,
  pp.property_sub_type,
  pp.structure_type,
  pp.bedrooms_total,
  pp.bathrooms_total,
  pp.above_grade_finished_area_sqft,
  latest_ml.id as latest_listing_row_id,
  latest_ml.listing_id as latest_listing_id,
  latest_ml.mls_status as latest_listing_status,
  latest_ml.list_price as latest_list_price,
  latest_ml.close_price as latest_close_price,
  latest_ml.listing_contract_date as latest_listing_date,
  latest_ml.created_at as latest_listing_created_at,
  ib.created_at as latest_imported_at
from public.real_properties rp
left join public.property_physical pp
  on pp.real_property_id = rp.id
left join lateral (
  select ml.*
  from public.mls_listings ml
  where ml.real_property_id = rp.id
  order by
    coalesce(ml.listing_contract_date::timestamp, ml.created_at) desc,
    ml.created_at desc
  limit 1
) latest_ml on true
left join public.import_batches ib
  on ib.id = latest_ml.last_import_batch_id;