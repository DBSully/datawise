-- Populate screening_results.latest_mls_* at insert time.
--
-- The existing trigger trg_mls_sync_screening_info (migration
-- 20260416240000) fires on mls_listings INSERT/DELETE/UPDATE and pushes
-- mls_status / major_change_type / listing_contract_date into whatever
-- screening_results rows already exist for that property. That works for
-- future MLS changes, but breaks on this ordering:
--
--   1. MLS CSV import updates mls_listings — trigger fires — nothing to
--      update because no screening_results row exists for the new batch
--      yet.
--   2. Screening batch runs via bulk-runner.ts, inserts a fresh
--      screening_results row with latest_* = NULL.
--   3. No further mls_listings change → latest_* stays NULL → /pipeline
--      renders "—" for Change Type and List Date.
--
-- This was reported 2026-04-24 for two Active → Pending rows in a batch
-- that had otherwise fresh data. Fix is a BEFORE INSERT trigger that
-- reads the current latest mls_listings snapshot for the property and
-- stamps it onto the new row.
--
-- Backfill handles rows already inserted with NULLs.

begin;

-- ---------------------------------------------------------------------------
-- BEFORE INSERT trigger — populate latest_mls_* from current mls_listings
-- ---------------------------------------------------------------------------

create or replace function public.populate_screening_result_latest_mls()
returns trigger
language plpgsql
as $$
declare
  latest_row record;
begin
  -- Skip if the caller already populated the fields (e.g. a future
  -- code path that explicitly sets them). Only fill when NULL.
  if new.latest_mls_status is not null
     or new.latest_mls_major_change_type is not null
     or new.latest_listing_contract_date is not null then
    return new;
  end if;

  select
    ml.mls_status,
    ml.mls_major_change_type,
    ml.listing_contract_date
    into latest_row
    from public.mls_listings ml
   where ml.real_property_id = new.real_property_id
   order by ml.listing_contract_date desc nulls last, ml.created_at desc
   limit 1;

  if found then
    new.latest_mls_status            := latest_row.mls_status;
    new.latest_mls_major_change_type := latest_row.mls_major_change_type;
    new.latest_listing_contract_date := latest_row.listing_contract_date;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_screening_results_populate_latest_mls
  on public.screening_results;

create trigger trg_screening_results_populate_latest_mls
  before insert on public.screening_results
  for each row
  execute function public.populate_screening_result_latest_mls();

-- ---------------------------------------------------------------------------
-- Backfill any currently-null rows
-- ---------------------------------------------------------------------------

update public.screening_results sr
   set latest_mls_status            = latest.mls_status,
       latest_mls_major_change_type = latest.mls_major_change_type,
       latest_listing_contract_date = latest.listing_contract_date
  from (
    select distinct on (ml.real_property_id)
      ml.real_property_id,
      ml.mls_status,
      ml.mls_major_change_type,
      ml.listing_contract_date
    from public.mls_listings ml
    order by ml.real_property_id, ml.listing_contract_date desc nulls last, ml.created_at desc
  ) latest
 where sr.real_property_id = latest.real_property_id
   and (
     sr.latest_mls_status is null
     or sr.latest_mls_major_change_type is null
     or sr.latest_listing_contract_date is null
   );

commit;
