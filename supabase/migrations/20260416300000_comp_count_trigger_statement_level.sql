-- Fix statement timeout on bulk screening imports.
--
-- The trg_csc_sync_screening_counts trigger from 20260416140000 fires
-- FOR EACH ROW on INSERT / UPDATE OF selected_yn / DELETE. Each fire
-- runs two COUNT queries and an UPDATE. That's fine for analyst toggles
-- (one row at a time), but bulk-runner inserts ~30 comp_candidates per
-- screened property — 14k rows for a 469-row import screen — and the
-- trigger overhead alone exceeds the 8s statement timeout.
--
-- Fix: split the trigger by operation.
--   - INSERT: AFTER STATEMENT with NEW TABLE transition. Recounts once
--     per INSERT batch for only the distinct run_ids that changed.
--   - DELETE: AFTER STATEMENT with OLD TABLE transition. Same pattern.
--   - UPDATE OF selected_yn: AFTER ROW (unchanged — these come from
--     analyst toggle actions, one row at a time).
--
-- All three call the same underlying recount logic, just scoped to
-- different sets of affected run_ids.

begin;

-- Drop the old per-row trigger and its function
drop trigger if exists trg_csc_sync_screening_counts
  on public.comparable_search_candidates;

drop function if exists public.sync_screening_result_comp_counts();

-- ---------------------------------------------------------------------------
-- Per-run recount helper. Updates comps_total + comps_selected on every
-- screening_results row whose comp_search_run_id is in the provided set.
-- ---------------------------------------------------------------------------

create or replace function public.recount_screening_comps_for_runs(
  run_ids uuid[]
)
returns void
language sql
as $$
  update public.screening_results sr
     set comps_total = (
           select count(*)::int
             from public.comparable_search_candidates
            where comparable_search_run_id = sr.comp_search_run_id
         ),
         comps_selected = (
           select count(*)::int
             from public.comparable_search_candidates
            where comparable_search_run_id = sr.comp_search_run_id
              and selected_yn
         )
   where sr.comp_search_run_id = any(run_ids);
$$;

-- ---------------------------------------------------------------------------
-- INSERT — statement-level with NEW TABLE transition
-- ---------------------------------------------------------------------------

create or replace function public.sync_screening_comp_counts_on_insert()
returns trigger
language plpgsql
as $$
declare
  affected_runs uuid[];
begin
  select array_agg(distinct comparable_search_run_id)
    into affected_runs
    from new_rows
   where comparable_search_run_id is not null;

  if affected_runs is not null and array_length(affected_runs, 1) > 0 then
    perform public.recount_screening_comps_for_runs(affected_runs);
  end if;

  return null;
end;
$$;

create trigger trg_csc_sync_counts_insert
  after insert
  on public.comparable_search_candidates
  referencing new table as new_rows
  for each statement
  execute function public.sync_screening_comp_counts_on_insert();

-- ---------------------------------------------------------------------------
-- DELETE — statement-level with OLD TABLE transition
-- ---------------------------------------------------------------------------

create or replace function public.sync_screening_comp_counts_on_delete()
returns trigger
language plpgsql
as $$
declare
  affected_runs uuid[];
begin
  select array_agg(distinct comparable_search_run_id)
    into affected_runs
    from old_rows
   where comparable_search_run_id is not null;

  if affected_runs is not null and array_length(affected_runs, 1) > 0 then
    perform public.recount_screening_comps_for_runs(affected_runs);
  end if;

  return null;
end;
$$;

create trigger trg_csc_sync_counts_delete
  after delete
  on public.comparable_search_candidates
  referencing old table as old_rows
  for each statement
  execute function public.sync_screening_comp_counts_on_delete();

-- ---------------------------------------------------------------------------
-- UPDATE of selected_yn — stays per-row. These come from analyst toggle
-- actions (one row at a time), so the per-row overhead is trivial.
-- ---------------------------------------------------------------------------

create or replace function public.sync_screening_comp_counts_on_update()
returns trigger
language plpgsql
as $$
begin
  if new.comparable_search_run_id is not null then
    perform public.recount_screening_comps_for_runs(
      array[new.comparable_search_run_id]
    );
  end if;
  return null;
end;
$$;

create trigger trg_csc_sync_counts_update
  after update of selected_yn
  on public.comparable_search_candidates
  for each row
  execute function public.sync_screening_comp_counts_on_update();

commit;
