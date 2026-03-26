-- Rename current valuation tables into comparable-search tables.
-- Safe to run once even if some parts were already changed manually.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'valuation_profiles'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'comparable_profiles'
  ) then
    alter table public.valuation_profiles rename to comparable_profiles;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'valuation_runs'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'comparable_search_runs'
  ) then
    alter table public.valuation_runs rename to comparable_search_runs;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'valuation_run_candidates'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'comparable_search_candidates'
  ) then
    alter table public.valuation_run_candidates rename to comparable_search_candidates;
  end if;
end $$;

-- Rename foreign-key columns to match the new comparable naming.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comparable_search_runs'
      and column_name = 'valuation_profile_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comparable_search_runs'
      and column_name = 'comparable_profile_id'
  ) then
    alter table public.comparable_search_runs
      rename column valuation_profile_id to comparable_profile_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comparable_search_candidates'
      and column_name = 'valuation_run_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comparable_search_candidates'
      and column_name = 'comparable_search_run_id'
  ) then
    alter table public.comparable_search_candidates
      rename column valuation_run_id to comparable_search_run_id;
  end if;
end $$;

-- Add purpose fields so the comparable engine can support ARV / rental / land / etc.

alter table public.comparable_profiles
  add column if not exists purpose text not null default 'arv';

alter table public.comparable_search_runs
  add column if not exists purpose text not null default 'arv';

-- Comparable set layer: the saved selected set that valuation will later consume.

create table if not exists public.comparable_sets (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  name text not null,
  purpose text not null default 'arv',
  source_search_run_id uuid references public.comparable_search_runs(id) on delete set null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comparable_set_members (
  id uuid primary key default gen_random_uuid(),
  comparable_set_id uuid not null references public.comparable_sets(id) on delete cascade,
  comp_listing_row_id uuid not null references public.mls_listings(id) on delete cascade,
  sort_order integer,
  include_yn boolean not null default true,
  selection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ux_comparable_set_members unique (comparable_set_id, comp_listing_row_id)
);

create index if not exists ix_comparable_profiles_purpose
  on public.comparable_profiles (purpose);

create index if not exists ix_comparable_search_runs_analysis_id
  on public.comparable_search_runs (analysis_id);

create index if not exists ix_comparable_search_runs_subject_real_property_id
  on public.comparable_search_runs (subject_real_property_id);

create index if not exists ix_comparable_search_runs_comparable_profile_id
  on public.comparable_search_runs (comparable_profile_id);

create index if not exists ix_comparable_search_runs_purpose
  on public.comparable_search_runs (purpose);

create index if not exists ix_comparable_search_candidates_run_id
  on public.comparable_search_candidates (comparable_search_run_id);

create index if not exists ix_comparable_search_candidates_selected
  on public.comparable_search_candidates (selected_yn);

create index if not exists ix_comparable_sets_analysis_id
  on public.comparable_sets (analysis_id);

create index if not exists ix_comparable_sets_purpose
  on public.comparable_sets (purpose);

create index if not exists ix_comparable_set_members_set_id
  on public.comparable_set_members (comparable_set_id);

create index if not exists ix_comparable_set_members_listing_row_id
  on public.comparable_set_members (comp_listing_row_id);

-- Updated-at triggers for new tables

drop trigger if exists trg_comparable_sets_updated_at
on public.comparable_sets;

create trigger trg_comparable_sets_updated_at
before update on public.comparable_sets
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_comparable_set_members_updated_at
on public.comparable_set_members;

create trigger trg_comparable_set_members_updated_at
before update on public.comparable_set_members
for each row
execute function public.set_row_updated_at();

-- RLS on new tables
alter table public.comparable_sets enable row level security;
alter table public.comparable_set_members enable row level security;

drop policy if exists "dev authenticated full access comparable_sets"
on public.comparable_sets;

create policy "dev authenticated full access comparable_sets"
on public.comparable_sets
for all
to authenticated
using (true)
with check (true);

drop policy if exists "dev authenticated full access comparable_set_members"
on public.comparable_set_members;

create policy "dev authenticated full access comparable_set_members"
on public.comparable_set_members
for all
to authenticated
using (true)
with check (true);