-- Dataset metrics: count of properties by MLS status
create or replace view public.mls_status_counts_v
with (security_invoker = true) as
select
  ml.mls_status,
  count(distinct ml.real_property_id) as property_count,
  count(ml.id) as listing_count
from public.mls_listings ml
where ml.real_property_id is not null
group by ml.mls_status;

-- Return count of Active/Coming Soon properties with no screening results
create or replace function public.count_unscreened_properties(statuses text[])
returns bigint
language sql
stable
security invoker
as $$
  select count(distinct ml.real_property_id)
  from public.mls_listings ml
  where ml.mls_status = any(statuses)
    and ml.real_property_id is not null
    and not exists (
      select 1 from public.screening_results sr
      where sr.real_property_id = ml.real_property_id
    );
$$;

-- Return the actual property IDs for unscreened properties (used by screening action)
create or replace function public.get_unscreened_property_ids(statuses text[])
returns table(real_property_id uuid)
language sql
stable
security invoker
as $$
  select distinct ml.real_property_id
  from public.mls_listings ml
  where ml.mls_status = any(statuses)
    and ml.real_property_id is not null
    and not exists (
      select 1 from public.screening_results sr
      where sr.real_property_id = ml.real_property_id
    );
$$;
