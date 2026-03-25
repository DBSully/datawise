create or replace view public.property_city_options_v
with (security_invoker = true) as
select distinct city
from public.real_properties
where city is not null
  and btrim(city) <> ''
order by city;

create or replace view public.property_status_options_v
with (security_invoker = true) as
select distinct latest_listing_status as listing_status
from public.property_browser_v
where latest_listing_status is not null
  and btrim(latest_listing_status) <> ''
order by latest_listing_status;

create or replace view public.property_type_options_v
with (security_invoker = true) as
select distinct property_type
from public.property_browser_v
where property_type is not null
  and btrim(property_type) <> ''
order by property_type;