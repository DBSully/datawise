
create table if not exists public.valuation_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  market text,
  source_system text,
  is_default boolean not null default false,
  rules_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.valuation_runs (
  id uuid primary key default gen_random_uuid(),
  valuation_profile_id uuid not null references public.valuation_profiles(id) on delete restrict,
  subject_real_property_id uuid not null references public.real_properties(id) on delete cascade,
  subject_listing_row_id uuid null references public.mls_listings(id) on delete set null,
  run_type text not null default 'manual',
  status text not null default 'complete',
  parameters_json jsonb not null default '{}'::jsonb,
  summary_json jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.valuation_run_candidates (
  id uuid primary key default gen_random_uuid(),
  valuation_run_id uuid not null references public.valuation_runs(id) on delete cascade,
  comp_listing_row_id uuid not null references public.mls_listings(id) on delete cascade,
  comp_real_property_id uuid not null references public.real_properties(id) on delete cascade,
  distance_miles numeric(8,3),
  days_since_close integer,
  sqft_delta_pct numeric(8,3),
  year_built_delta integer,
  bed_delta integer,
  bath_delta numeric(8,2),
  raw_score numeric(8,3),
  selected_yn boolean not null default false,
  rejection_reason text,
  metrics_json jsonb,
  created_at timestamptz not null default now(),
  unique (valuation_run_id, comp_listing_row_id)
);

create index if not exists ix_valuation_profiles_slug
  on public.valuation_profiles (slug);

create index if not exists ix_valuation_runs_subject_real_property_id
  on public.valuation_runs (subject_real_property_id);

create index if not exists ix_valuation_runs_subject_listing_row_id
  on public.valuation_runs (subject_listing_row_id);

create index if not exists ix_valuation_run_candidates_run_id
  on public.valuation_run_candidates (valuation_run_id);

create index if not exists ix_valuation_run_candidates_comp_real_property_id
  on public.valuation_run_candidates (comp_real_property_id);

create index if not exists ix_valuation_run_candidates_raw_score
  on public.valuation_run_candidates (raw_score desc);

alter table public.valuation_profiles enable row level security;
alter table public.valuation_runs enable row level security;
alter table public.valuation_run_candidates enable row level security;

drop policy if exists "dev authenticated full access valuation_profiles"
on public.valuation_profiles;

create policy "dev authenticated full access valuation_profiles"
on public.valuation_profiles
for all
to authenticated
using (true)
with check (true);

drop policy if exists "dev authenticated full access valuation_runs"
on public.valuation_runs;

create policy "dev authenticated full access valuation_runs"
on public.valuation_runs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "dev authenticated full access valuation_run_candidates"
on public.valuation_run_candidates;

create policy "dev authenticated full access valuation_run_candidates"
on public.valuation_run_candidates
for all
to authenticated
using (true)
with check (true);

drop trigger if exists trg_valuation_profiles_updated_at
on public.valuation_profiles;

create trigger trg_valuation_profiles_updated_at
before update on public.valuation_profiles
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_valuation_runs_updated_at
on public.valuation_runs;

create trigger trg_valuation_runs_updated_at
before update on public.valuation_runs
for each row
execute function public.set_row_updated_at();

insert into public.valuation_profiles (
  slug,
  name,
  market,
  source_system,
  is_default,
  rules_json
)
values (
  'denver_detached_basic_v1',
  'Denver Detached Basic v1',
  'Denver',
  'recolorado',
  true,
  jsonb_build_object(
    'default_max_distance_miles', 0.5,
    'default_max_days_since_close', 365,
    'default_sqft_tolerance_pct', 20,
    'default_year_built_tolerance', 25,
    'default_bed_tolerance', 1,
    'default_bath_tolerance', 1,
    'default_max_candidate_count', 15,
    'default_require_same_level_class', true,
    'default_require_same_property_type', true
  )
)
on conflict (slug) do update
set
  name = excluded.name,
  market = excluded.market,
  source_system = excluded.source_system,
  is_default = excluded.is_default,
  rules_json = excluded.rules_json,
  updated_at = now();
