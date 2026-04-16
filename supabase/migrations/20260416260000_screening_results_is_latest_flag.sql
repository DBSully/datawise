-- Replace DISTINCT ON (real_property_id) with a maintained flag.
--
-- EXPLAIN ANALYZE showed 5.5s on a simple /screening query — the
-- Index Scan on screening_results touched 47,000 buffer pages (~375MB)
-- because DISTINCT ON over 71,650 wide rows (avg 1KB/row) forces a
-- full heap traversal for every row, even though only 18,838 unique
-- properties and only 50 visible rows are needed.
--
-- Fix: add is_latest_for_property column maintained by a trigger on
-- INSERT/DELETE. The slim view becomes a simple WHERE filter — no sort,
-- no dedup, no heap traversal of historical rows.
--
-- Partial index on (is_latest_for_property = true) keeps reads fast
-- even as screening_results grows.

begin;

-- ---------------------------------------------------------------------------
-- 1. Column (fast — DEFAULT for non-volatile literal is metadata-only in PG11+)
-- ---------------------------------------------------------------------------

alter table public.screening_results
  add column if not exists is_latest_for_property boolean not null default false;

alter table public.screening_results
  alter column is_latest_for_property set default true;

comment on column public.screening_results.is_latest_for_property is
  'True for the most recent screening_results row per real_property_id. '
  'Maintained by trg_screening_results_sync_latest on INSERT/DELETE. '
  'Default true for new inserts — the trigger clears siblings for the '
  'same property.';

-- ---------------------------------------------------------------------------
-- 2. Trigger
-- ---------------------------------------------------------------------------

create or replace function public.sync_latest_screening_flag()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- New row is the latest by virtue of its INSERT time. Clear the
    -- flag on older siblings for the same property.
    update public.screening_results
       set is_latest_for_property = false
     where real_property_id = new.real_property_id
       and id != new.id
       and is_latest_for_property = true;
  elsif tg_op = 'DELETE' and old.is_latest_for_property then
    -- The deleted row was the latest. Promote the next-latest sibling.
    update public.screening_results
       set is_latest_for_property = true
     where id = (
       select id
         from public.screening_results
        where real_property_id = old.real_property_id
        order by created_at desc
        limit 1
     );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_screening_results_sync_latest
  on public.screening_results;

create trigger trg_screening_results_sync_latest
  after insert or delete
  on public.screening_results
  for each row
  execute function public.sync_latest_screening_flag();

-- ---------------------------------------------------------------------------
-- 3. Backfill — set the flag on 18k latest rows, leaving the rest at false
-- ---------------------------------------------------------------------------

with latest_ids as (
  select distinct on (real_property_id) id
    from public.screening_results
   order by real_property_id, created_at desc
)
update public.screening_results sr
   set is_latest_for_property = true
  from latest_ids
 where sr.id = latest_ids.id;

-- ---------------------------------------------------------------------------
-- 4. Partial indexes — leading with the filter, covering common sorts
-- ---------------------------------------------------------------------------

-- The screening queue's most-common filter is on latest_mls_status and the
-- default sort is est_gap_per_sqft. This composite partial index lets
-- Postgres serve the query via an index scan over at most 18,838 rows.
create index if not exists ix_screening_results_latest_queue
  on public.screening_results (latest_mls_status, est_gap_per_sqft desc nulls last)
  where is_latest_for_property = true;

-- A second index keyed on real_property_id for the NOT IN / IN paths
-- (dedup guard, visible-property lookups).
create index if not exists ix_screening_results_latest_by_property
  on public.screening_results (real_property_id)
  where is_latest_for_property = true;

-- ---------------------------------------------------------------------------
-- 5. Rewrite the slim view — no DISTINCT ON, just a filter
-- ---------------------------------------------------------------------------

drop view if exists public.screening_results_latest_v;

create view public.screening_results_latest_v
with (security_invoker = true) as
select
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
where is_latest_for_property = true;

commit;
