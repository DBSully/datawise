-- Add the missing index on screening_results.comp_search_run_id.
--
-- The statement-level trigger from 20260416300000 still timed out on
-- bulk screening imports — every INSERT of candidate rows triggered a
-- recount that did UPDATE screening_results WHERE comp_search_run_id =
-- ANY(run_ids), and that WHERE clause had no supporting index, forcing
-- a sequential scan of ~71k screening_results rows.
--
-- The INSERT-time scan is typically over 0 matching rows (bulk-runner
-- inserts candidates before the corresponding screening_results row is
-- written — see writeCompRuns→writeScreeningResults ordering in
-- bulk-runner.ts), but Postgres still has to scan to confirm zero matches.
-- 70 INSERT batches × ~500ms per seq scan = 35s+ of pure no-op work.

begin;

create index if not exists ix_screening_results_comp_search_run_id
  on public.screening_results (comp_search_run_id)
  where comp_search_run_id is not null;

commit;
