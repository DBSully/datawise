-- Denormalize the latest MLS state onto screening_results so the queue
-- can filter by mls_status / listing_contract_date without a pre-query.
--
-- Why: /screening filters (mls_status, listingDays) used to require an
-- upstream query on mls_listings to build a property_id IN-list, which
-- blew the PostgREST URL length limit when filters matched thousands of
-- properties ("Active" listings in particular) — the symptom was a
-- 400 Bad Request at query time.
--
-- Pattern mirrors the comp-counts denormalization earlier today:
--   - Columns maintained automatically by a trigger on mls_listings
--     INSERT / DELETE / UPDATE of the three watched fields.
--   - Backfill via single JOIN in this migration.
--   - Reads become a cheap direct column filter.

begin;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.screening_results
  add column if not exists latest_mls_status            text,
  add column if not exists latest_mls_major_change_type text,
  add column if not exists latest_listing_contract_date date;

comment on column public.screening_results.latest_mls_status is
  'Denormalized latest mls_listings.mls_status for the property. Maintained by trg_mls_sync_screening_info.';

-- Index to accelerate the mls_status filter on the queue page
create index if not exists ix_screening_results_latest_mls_status
  on public.screening_results (latest_mls_status);

create index if not exists ix_screening_results_latest_listing_contract_date
  on public.screening_results (latest_listing_contract_date);

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create or replace function public.sync_screening_result_mls_info()
returns trigger
language plpgsql
as $$
declare
  target_property_id uuid;
begin
  target_property_id := coalesce(new.real_property_id, old.real_property_id);
  if target_property_id is null then
    return null;
  end if;

  update public.screening_results sr
     set latest_mls_status            = latest.mls_status,
         latest_mls_major_change_type = latest.mls_major_change_type,
         latest_listing_contract_date = latest.listing_contract_date
    from (
      select ml.mls_status, ml.mls_major_change_type, ml.listing_contract_date
        from public.mls_listings ml
       where ml.real_property_id = target_property_id
       order by ml.listing_contract_date desc nulls last, ml.created_at desc
       limit 1
    ) latest
   where sr.real_property_id = target_property_id;

  return null;
end;
$$;

drop trigger if exists trg_mls_sync_screening_info
  on public.mls_listings;

-- Fires on any INSERT, DELETE, or UPDATE that touches the watched fields.
-- The 3 listed columns are the only ones we denormalize — other mls_listings
-- updates (e.g. agent fields) skip the trigger.
create trigger trg_mls_sync_screening_info
  after insert or delete
        or update of mls_status, mls_major_change_type, listing_contract_date
  on public.mls_listings
  for each row
  execute function public.sync_screening_result_mls_info();

-- ---------------------------------------------------------------------------
-- Backfill existing rows
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
 where sr.real_property_id = latest.real_property_id;

-- ---------------------------------------------------------------------------
-- Extend screening_results_latest_v to expose the new columns
-- ---------------------------------------------------------------------------

drop view if exists public.screening_results_latest_v;

create view public.screening_results_latest_v
with (security_invoker = true) as
select distinct on (real_property_id)
  id,
  screening_batch_id,
  real_property_id,
  subject_address,
  subject_city,
  subject_property_type,
  subject_list_price,
  subject_building_sqft,
  subject_above_grade_sqft,
  subject_below_grade_total_sqft,
  subject_year_built,
  arv_aggregate,
  arv_per_sqft,
  arv_comp_count,
  rehab_total,
  hold_total,
  transaction_total,
  financing_total,
  max_offer,
  spread,
  est_gap_per_sqft,
  offer_pct,
  is_prime_candidate,
  screening_status,
  promoted_analysis_id,
  comp_search_run_id,
  trend_annual_rate,
  trend_confidence,
  trend_detail_json,
  review_action,
  reviewed_at,
  pass_reason,
  screening_updated_at,
  created_at,
  latest_mls_status,
  latest_mls_major_change_type,
  latest_listing_contract_date
from public.screening_results
order by real_property_id, created_at desc;

commit;
