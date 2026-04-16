-- Rewrite property_type_options_v to query property_physical directly
-- instead of property_browser_v, which is a heavy 4-table join view meant
-- for the browser table. For a dropdown, we just need distinct
-- property_type values — no listings, no physical joins, no import batch.
--
-- Measured impact: the view was 2440ms on /screening's filter-options
-- parallel fetch. Expected to drop to <50ms after this change.
--
-- Same treatment applied to property_status_options_v preemptively,
-- since it shares the same underlying view and will hit the same issue
-- on any page that uses it.

begin;

drop view if exists public.property_type_options_v;
create view public.property_type_options_v
with (security_invoker = true) as
select distinct property_type
from public.property_physical
where property_type is not null
  and btrim(property_type) <> ''
order by property_type;

drop view if exists public.property_status_options_v;
create view public.property_status_options_v
with (security_invoker = true) as
select distinct mls_status as listing_status
from public.mls_listings
where mls_status is not null
  and btrim(mls_status) <> ''
order by mls_status;

commit;
