-- Add import batch linkage to real_properties so manual entries (and any
-- future non-MLS source) can be traced back to their import batch.

alter table public.real_properties
  add column if not exists last_import_batch_id uuid
    references public.import_batches(id)
    on delete set null;

create index if not exists ix_real_properties_last_import_batch_id
  on public.real_properties (last_import_batch_id);

-- Update the RPC to also return properties linked directly via
-- real_properties.last_import_batch_id (manual entries, future sources).
create or replace function public.get_import_batch_property_ids(p_import_batch_id uuid)
returns table(real_property_id uuid)
language sql
stable
security invoker
as $$
  select distinct ml.real_property_id
  from public.mls_listings ml
  where ml.last_import_batch_id = p_import_batch_id
    and ml.real_property_id is not null

  union

  select rp.id as real_property_id
  from public.real_properties rp
  where rp.last_import_batch_id = p_import_batch_id;
$$;
