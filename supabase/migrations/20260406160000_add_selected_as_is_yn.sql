-- Add As-Is selection flag to comparable_search_candidates.
-- ARV selection uses selected_yn; As-Is selection uses selected_as_is_yn.
-- Both draw from the same candidate pool.

alter table public.comparable_search_candidates
  add column if not exists selected_as_is_yn boolean not null default false;

create index if not exists ix_comparable_search_candidates_selected_as_is
  on public.comparable_search_candidates (selected_as_is_yn);
