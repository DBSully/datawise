-- Move property_events writes from application code into a SECURITY DEFINER
-- trigger on mls_listings.
--
-- Why: migration 20260416180000 enabled RLS on property_events with only a
-- SELECT policy — the author's comment assumed the import pipeline ran as the
-- service role, but lib/supabase/server.ts returns a cookie-backed client
-- tied to the authenticated user. Every insert from process-batch.ts has been
-- silently denied by RLS since the feature shipped. The event counts on
-- watch_list_v have been zero for everyone.
--
-- Fix: detect + insert events at the DB level. Statement-level trigger on
-- UPDATE of the six watched fields, SECURITY DEFINER so the insert bypasses
-- RLS, NEW TABLE + OLD TABLE transitions so the trigger scales with bulk
-- upserts (per the trigger perf checklist in 20260416300000). The JS-side
-- buildListingChangeEvents path is removed in the same commit.
--
-- Backfill note: we don't reconstruct missed events — upserts overwrite the
-- prior snapshot, so we only have current state. Events are go-forward only.
-- The next import that touches a watched field will emit normally.

begin;

-- ---------------------------------------------------------------------------
-- Trigger function — statement-level, compares OLD/NEW transition tables
-- ---------------------------------------------------------------------------

create or replace function public.emit_listing_change_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.property_events (
    real_property_id,
    mls_listing_id,
    event_type,
    before_value,
    after_value,
    source_import_batch_id
  )
  select
    n.real_property_id,
    n.id,
    evt.event_type,
    evt.before_value,
    evt.after_value,
    n.last_import_batch_id
  from new_rows n
  join old_rows o on o.id = n.id
  cross join lateral (
    values
      ('price_change'::text,
        to_jsonb(o.list_price),
        to_jsonb(n.list_price),
        o.list_price is distinct from n.list_price),
      ('close_price'::text,
        to_jsonb(o.close_price),
        to_jsonb(n.close_price),
        o.close_price is distinct from n.close_price),
      ('status_change'::text,
        to_jsonb(o.mls_status),
        to_jsonb(n.mls_status),
        o.mls_status is distinct from n.mls_status),
      ('change_type'::text,
        to_jsonb(o.mls_major_change_type),
        to_jsonb(n.mls_major_change_type),
        o.mls_major_change_type is distinct from n.mls_major_change_type),
      ('uc_date'::text,
        to_jsonb(o.purchase_contract_date),
        to_jsonb(n.purchase_contract_date),
        o.purchase_contract_date is distinct from n.purchase_contract_date),
      ('close_date'::text,
        to_jsonb(o.close_date),
        to_jsonb(n.close_date),
        o.close_date is distinct from n.close_date)
  ) as evt(event_type, before_value, after_value, changed)
  where evt.changed;

  return null;
end;
$$;

comment on function public.emit_listing_change_events() is
  'Statement-level trigger body. Diffs OLD/NEW for the six watched fields and '
  'inserts a property_events row per change. SECURITY DEFINER so the insert '
  'bypasses RLS — callers (authenticated import pipeline) do not need INSERT '
  'rights on property_events.';

-- ---------------------------------------------------------------------------
-- Trigger — AFTER UPDATE OF the six watched fields, statement-level
-- ---------------------------------------------------------------------------

drop trigger if exists trg_mls_emit_change_events on public.mls_listings;

-- NOTE on AFTER UPDATE (not AFTER UPDATE OF <cols>): Postgres rejects a
-- column list combined with transition tables (SQLSTATE 0A000 —
-- feature_not_supported). Firing on every UPDATE is fine: the trigger
-- body filters with IS DISTINCT FROM, so a non-watched-field change
-- (e.g., an agent field) produces zero inserts. The extra cost is a
-- cheap cross join + filter per statement.
create trigger trg_mls_emit_change_events
  after update on public.mls_listings
  referencing new table as new_rows old table as old_rows
  for each statement
  execute function public.emit_listing_change_events();

commit;
