-- Return property IDs that were imported/updated by a specific import batch
create or replace function public.get_import_batch_property_ids(p_import_batch_id uuid)
returns table(real_property_id uuid)
language sql
stable
security invoker
as $$
  select distinct ml.real_property_id
  from public.mls_listings ml
  where ml.last_import_batch_id = p_import_batch_id
    and ml.real_property_id is not null;
$$;
