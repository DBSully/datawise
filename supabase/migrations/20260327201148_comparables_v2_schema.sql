-- Comparables V2 foundation migration
-- Use as a starting migration file and adjust naming if your repo has a timestamp convention.

begin;

-- 1) Property physical enrichments
alter table public.property_physical
  add column if not exists lot_size_sqft numeric,
  add column if not exists below_grade_total_sqft numeric,
  add column if not exists levels_raw text,
  add column if not exists building_form_standardized text;

comment on column public.property_physical.lot_size_sqft
  is 'Canonical lot size in square feet. Use for scrape/new-build and detached-land-sensitive comparable searches.';

comment on column public.property_physical.below_grade_total_sqft
  is 'Total below-grade area in square feet. Enables basement-sensitive flip and layout comparisons.';

comment on column public.property_physical.levels_raw
  is 'Source/raw level description used for precise style/layout matching when standardized class is not specific enough.';

comment on column public.property_physical.building_form_standardized
  is 'Standardized building form such as high-rise, low-rise, garden, townhouse-style, etc., especially useful for condos/attached housing.';

-- 2) Candidate enrichment fields
alter table public.comparable_search_candidates
  add column if not exists lot_size_delta_pct numeric,
  add column if not exists form_match_score numeric,
  add column if not exists score_breakdown_json jsonb not null default '{}'::jsonb;

comment on column public.comparable_search_candidates.lot_size_delta_pct
  is 'Percent delta between subject and candidate lot size based on active lot-size comparison logic.';

comment on column public.comparable_search_candidates.form_match_score
  is 'Optional normalized form/style/building-form match score for debugging and analyst transparency.';

comment on column public.comparable_search_candidates.score_breakdown_json
  is 'Detailed scoring component breakdown persisted for analyst transparency and future UI explanation.';

-- 3) Helpful indexes for future comparables filtering/reporting
create index if not exists idx_property_physical_lot_size_sqft
  on public.property_physical (lot_size_sqft);

create index if not exists idx_property_physical_building_form_standardized
  on public.property_physical (building_form_standardized);

create index if not exists idx_comparable_search_candidates_run_id
  on public.comparable_search_candidates (comparable_search_run_id);

commit;
